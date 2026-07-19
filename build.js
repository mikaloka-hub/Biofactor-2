const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const express = require('express');

const PORT = 3000;
const app = express();
app.use(express.static(__dirname));

async function main() {
  const server = app.listen(PORT);
  console.log('Server started on port ' + PORT);

  if (!fs.existsSync('dist')) fs.mkdirSync('dist');
  if (!fs.existsSync('dist/en')) fs.mkdirSync('dist/en');
  if (!fs.existsSync('dist/assets')) fs.mkdirSync('dist/assets');
  if (!fs.existsSync('dist/en/assets')) fs.mkdirSync('dist/en/assets');

  // Copy raw files that need to stay (js)
  fs.copyFileSync('support.js', 'dist/support.js');
  fs.copyFileSync('products-data.js', 'dist/products-data.js');
  fs.copyFileSync('support.js', 'dist/en/support.js');
  fs.copyFileSync('products-data.js', 'dist/en/products-data.js');

  // Process images
  const files = fs.readdirSync('assets');
  for (const file of files) {
    if (file.endsWith('.jpg') || file.endsWith('.jpeg')) {
      const src = path.join('assets', file);
      const name = path.basename(file, path.extname(file));
      
      await sharp(src).resize(640).webp().toFile(`dist/assets/${name}-640.webp`);
      await sharp(src).resize(1280).webp().toFile(`dist/assets/${name}-1280.webp`);
      await sharp(src).webp().toFile(`dist/assets/${name}.webp`);
      fs.copyFileSync(src, `dist/assets/${file}`);
      
      // Also copy to en/assets for relative paths in english pages if needed (though we'll use absolute/base paths or keep it simple)
      // We will rewrite the image URLs in EN to point to ../assets, so we don't need to duplicate images.
    } else {
      fs.copyFileSync(path.join('assets', file), `dist/assets/${file}`);
    }
  }
  
  // Puppeteer
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const pagesToRender = [
    'index.html',
    'nosotros.html',
    'productos.html',
    'farmacovigilancia.html',
    'licencias.html',
    'contacto.html',
    'privacidad.html'
  ];

  for (const pageName of pagesToRender) {
    if (!fs.existsSync(pageName)) {
      console.warn(`Warning: ${pageName} not found, skipping.`);
      continue;
    }
    const page = await browser.newPage();
    
    // Catch fetch to sheet and wait for it? Puppeteer will just evaluate it.
    
    // Spanish
    await page.goto(`http://localhost:${PORT}/${pageName}`);
    await page.evaluate(() => localStorage.setItem('bf_lang', 'es'));
    await page.reload();
    
    // Wait for hydration
    await page.waitForSelector('[data-screen-label]', { timeout: 10000 });
    if (pageName === 'productos.html') {
      try { await page.waitForSelector('#catalog-wrap h3', { timeout: 10000 }); } catch (e) { console.error('Timeout waiting for catalog'); }
    }
    
    let htmlEs = await page.content();
    
    // English
    await page.evaluate(() => localStorage.setItem('bf_lang', 'en'));
    await page.reload();
    await page.waitForSelector('[data-screen-label]', { timeout: 10000 });
    if (pageName === 'productos.html') {
      try { await page.waitForSelector('#catalog-wrap h3', { timeout: 10000 }); } catch (e) { console.error('Timeout waiting for catalog'); }
    }
    
    let htmlEn = await page.content();
    await page.close();
    
    // Post process HTML
    htmlEs = postProcess(htmlEs, pageName, 'es');
    htmlEn = postProcess(htmlEn, pageName, 'en');
    
    fs.writeFileSync(`dist/${pageName}`, htmlEs);
    fs.writeFileSync(`dist/en/${pageName}`, htmlEn);
  }
  
  await browser.close();
  server.close();
  
  generateSitemap(pagesToRender);
}

function postProcess(html, pageName, lang) {
  const title = getTitle(pageName, lang);
  const desc = getDesc(pageName, lang);
  const baseUrl = 'https://biofactor.com.ar';
  const urlPath = pageName === 'index.html' ? '' : pageName.replace('.html', '');
  const permalink = lang === 'es' ? `${baseUrl}/${urlPath}` : `${baseUrl}/en/${urlPath}`;
  const altLink = lang === 'es' ? `${baseUrl}/en/${urlPath}` : `${baseUrl}/${urlPath}`;
  
  const sentryDsn = process.env.SENTRY_DSN;
  const cfAnalytics = process.env.CF_ANALYTICS_TOKEN;
  let scriptsInject = '';
  if (sentryDsn) {
    scriptsInject += `\n    <script src="https://js.sentry-cdn.com/${sentryDsn}.min.js" crossorigin="anonymous"></script>`;
  }
  if (cfAnalytics) {
    scriptsInject += `\n    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "${cfAnalytics}"}'></script>`;
  }

  const headInject = `
    <title>${title}</title>
    <meta name="description" content="${desc}">
    <link rel="canonical" href="${permalink}">
    <link rel="alternate" hreflang="es-AR" href="${lang === 'es' ? permalink : altLink}">
    <link rel="alternate" hreflang="en" href="${lang === 'en' ? permalink : altLink}">
    <link rel="alternate" hreflang="x-default" href="${lang === 'es' ? permalink : altLink}">
    ${scriptsInject}
  `;
  
  html = html.replace('<head>', `<head>\n${headInject}`);
  
  html = html.replace(/<img([^>]*)src="assets\/([^"]+)\.jpg"([^>]*)>/g, (match, p1, name, p2) => {
    // Determine path based on lang
    const assetPath = lang === 'en' ? '../assets' : 'assets';
    return `<img${p1}src="${assetPath}/${name}.jpg" srcset="${assetPath}/${name}-640.webp 640w, ${assetPath}/${name}-1280.webp 1280w, ${assetPath}/${name}.webp 1920w" loading="lazy"${p2}>`;
  });

  html = html.replace(/src="assets\/([^"]+)\.png"/g, (match, name) => {
    const assetPath = lang === 'en' ? '../assets' : 'assets';
    return `src="${assetPath}/${name}.png"`;
  });

  if (pageName === 'contacto.html') {
    html = html.replace('</body>', `<form name="contacto" data-netlify="true" netlify-honeypot="bot-field" hidden><input type="text" name="area"><input type="text" name="nombre"><input type="text" name="apellido"><input type="email" name="email"><textarea name="mensaje"></textarea><input name="bot-field"></form></body>`);
  }
  if (pageName === 'farmacovigilancia.html') {
    html = html.replace('</body>', `<form name="farmacovigilancia" data-netlify="true" data-netlify-recaptcha="true" netlify-honeypot="bot-field" hidden><input type="text" name="reportante"><input type="email" name="email"><input type="text" name="telefono"><input type="text" name="medico"><input type="text" name="producto"><input type="text" name="lote"><input type="text" name="paciente"><input type="text" name="edad"><input type="text" name="sexo"><input type="text" name="peso"><textarea name="descripcion"></textarea><input type="text" name="refId"><input name="bot-field"></form></body>`);
  }
  
  // Link replacement logic for lang toggle
  // The toggle buttons are <button onClick="{{ setEs }}"> and <button onClick="{{ setEn }}">
  // Let's rewrite the ES/EN toggle in HTML to be actual link navigations since we split the URLs.
  if (lang === 'es') {
    html = html.replace(/<button onClick="\{\{ setEn \}\}"([^>]*)>EN<\/button>/g, `<a href="/en/${urlPath}" $1 style="text-decoration: none; display: inline-block;">EN</a>`);
    html = html.replace(/<button onClick="\{\{ setEs \}\}"([^>]*)>ES<\/button>/g, `<a href="/${urlPath}" $1 style="text-decoration: none; display: inline-block;">ES</a>`);
  } else {
    // English needs paths fixed
    html = html.replace(/<button onClick="\{\{ setEn \}\}"([^>]*)>EN<\/button>/g, `<a href="/en/${urlPath}" $1 style="text-decoration: none; display: inline-block;">EN</a>`);
    html = html.replace(/<button onClick="\{\{ setEs \}\}"([^>]*)>ES<\/button>/g, `<a href="/${urlPath}" $1 style="text-decoration: none; display: inline-block;">ES</a>`);
    
    // Update nav links to point to /en/
    html = html.replace(/href="([^"]+\.html)"/g, (match, p1) => {
      if (p1.startsWith('http')) return match;
      if (p1 === 'index.html') return `href="/en/"`;
      return `href="/en/${p1}"`;
    });
  }
  
  return html;
}

function getTitle(pageName, lang) {
  const titles = {
    'index.html': { es: 'Biofactor - Inicio', en: 'Biofactor - Home' },
    'nosotros.html': { es: 'Biofactor - Nosotros', en: 'Biofactor - About Us' },
    'productos.html': { es: 'Biofactor - Productos', en: 'Biofactor - Products' },
    'farmacovigilancia.html': { es: 'Biofactor - Farmacovigilancia', en: 'Biofactor - Pharmacovigilance' },
    'licencias.html': { es: 'Biofactor - Licencias', en: 'Biofactor - Licensing' },
    'contacto.html': { es: 'Biofactor - Contacto', en: 'Biofactor - Contact' },
    'privacidad.html': { es: 'Biofactor - Privacidad', en: 'Biofactor - Privacy Policy' }
  };
  return titles[pageName]?.[lang] || 'Biofactor';
}

function getDesc(pageName, lang) {
  return lang === 'es' 
    ? 'Especialidades farmacéuticas de clase mundial. Innovación farmacéutica al servicio de la salud.'
    : 'World-class pharmaceutical specialties. Pharmaceutical innovation in service of health.';
}

function generateSitemap(pages) {
  const baseUrl = 'https://biofactor.com.ar';
  let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n';
  
  pages.forEach(p => {
    if(!fs.existsSync(p)) return;
    const urlPath = p === 'index.html' ? '' : p.replace('.html', '');
    const esUrl = `${baseUrl}/${urlPath}`;
    const enUrl = `${baseUrl}/en/${urlPath}`;
    
    sitemap += `  <url>\n    <loc>${esUrl}</loc>\n    <xhtml:link rel="alternate" hreflang="es" href="${esUrl}" />\n    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />\n  </url>\n`;
    sitemap += `  <url>\n    <loc>${enUrl}</loc>\n    <xhtml:link rel="alternate" hreflang="es" href="${esUrl}" />\n    <xhtml:link rel="alternate" hreflang="en" href="${enUrl}" />\n  </url>\n`;
  });
  sitemap += '</urlset>';
  fs.writeFileSync('dist/sitemap.xml', sitemap);
  fs.writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml`);
}

main().catch(console.error);
