// ==UserScript==
// @name         calibre Amazon Export (PoC)
// @namespace    local.calibre.amazon-export
// @version      0.5.3
// @author       kobi-wan
// @license      MIT
// @homepageURL  https://github.com/kobi-wan/calibre-amazon-export
// @supportURL   https://github.com/kobi-wan/calibre-amazon-export/issues
// @updateURL    https://github.com/kobi-wan/calibre-amazon-export/releases/latest/download/calibre-amazon-export.meta.js
// @downloadURL  https://github.com/kobi-wan/calibre-amazon-export/releases/latest/download/calibre-amazon-export.user.js
// @description  Export book metadata and covers from regional Amazon sites to calibre
// @match        https://www.amazon.de/*
// @match        https://amazon.de/*
// @match        https://*.amazon.com/*
// @match        https://*.amazon.co.uk/*
// @match        https://*.amazon.ca/*
// @match        https://*.amazon.com.au/*
// @match        https://*.amazon.in/*
// @match        https://*.amazon.fr/*
// @match        https://*.amazon.it/*
// @match        https://*.amazon.es/*
// @match        https://*.amazon.com.br/*
// @match        https://*.amazon.com.mx/*
// @match        https://*.amazon.co.jp/*
// @match        https://*.amazon.nl/*
// @match        https://*.amazon.se/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @connect      m.media-amazon.com
// @connect      images-eu.ssl-images-amazon.com
// @connect      images-na.ssl-images-amazon.com
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  const MIME = 'application/calibre-book-metadata';
  const clean = s => String(s || '').replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
  const xml = s => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
  const unique = xs => [...new Set(xs.filter(Boolean))];
  const AUDIO_WARNING='Audiobook selected: These metadata describe the audio edition. The ASIN, publisher, publication date and cover may differ from the print or Kindle edition. To update an e-book, select the matching edition on Amazon first.';
  function selectedEdition(doc) {
    const text=el=>{
      if(!el)return '';
      const copy=el.cloneNode(true);copy.querySelectorAll('script,style').forEach(x=>x.remove());
      return clean(copy.textContent);
    };
    const selected=doc.querySelector('#tmmSwatches [aria-checked="true"], #tmmSwatchesList [aria-checked="true"], #tmmSwatches .swatchElement.selected, #tmmSwatches .a-button-selected, #tmmSwatchesList .swatchElement.selected');
    // Use only the selected option, never all format offers or recommendation text.
    const label=selected ? text(selected.querySelector('.slot-title, .a-button-text .a-size-base')||selected) :
      clean(text(doc.querySelector('#bylineInfo')).match(/(?:Format|Formato|形式)\s*[:：]\s*(.+)$/i)?.[1]);
    const audio=/\b(?:audiobook|audio\s*book|audible|horbuch|horbucher|hoerbuch|livre\s+audio|audiolibro|audiolivro|luisterboek|ljudbok|audio\s*cd)\b|オーディオブック/i.test(label.normalize('NFD').replace(/\p{M}/gu,''));
    return {label,isAudiobook:audio};
  }
  const norm = s => clean(s).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
  const STORES = {'amazon.de':'de','amazon.com':'com','amazon.co.uk':'uk','amazon.ca':'ca','amazon.com.au':'au','amazon.in':'in','amazon.fr':'fr','amazon.it':'it','amazon.es':'es','amazon.com.br':'br','amazon.com.mx':'mx','amazon.co.jp':'jp','amazon.nl':'nl','amazon.se':'se'};
  function storeFor(url) {
    const hostname=new URL(url).hostname.toLowerCase();
    const host=Object.keys(STORES).find(h=>hostname===h || hostname==='www.'+h);
    if(!host)throw new Error('This Amazon region is not supported yet.');
    const region=STORES[host];
    return {host,region,identifier:region==='com'?'amazon':'amazon_'+region};
  }
  const LOCALES=['de','en','fr','it','es','pt','nl','sv','ja'];
  const MONTHS=new Map();
  for(const locale of LOCALES) for(const width of ['long','short']) for(let i=0;i<12;i++) {
    const name=new Intl.DateTimeFormat(locale,{month:width,timeZone:'UTC'}).format(new Date(Date.UTC(2024,i,15)));
    MONTHS.set(norm(name).replace(/\./g,''),i+1);
  }
  const LANGUAGE_CODES={de:'deu',en:'eng',fr:'fra',it:'ita',es:'spa',pt:'por',nl:'nld',sv:'swe',ja:'jpn',zh:'zho',ar:'ara',hi:'hin',pl:'pol',tr:'tur',da:'dan',no:'nor',fi:'fin',ru:'rus',uk:'ukr',cs:'ces',el:'ell',he:'heb',ko:'kor'};
  const LANGUAGE_NAMES=new Map(Object.entries(LANGUAGE_CODES));
  for(const [code,iso] of Object.entries(LANGUAGE_CODES)) {
    LANGUAGE_NAMES.set(iso,iso);
    for(const locale of LOCALES) LANGUAGE_NAMES.set(norm(new Intl.DisplayNames([locale],{type:'language'}).of(code)),iso);
  }
  function languageValue(raw) {
    const n=norm(raw);return LANGUAGE_NAMES.get(n)||LANGUAGE_CODES[n.split(/[-_]/)[0]]||'';
  }

  function findCover(doc, book={}, base=doc.baseURI) {
    const valid = raw => {
      try {
        if (!raw || /^(data:|blob:)/i.test(raw)) return '';
        const u=new URL(raw,base);
        return /^https?:$/.test(u.protocol) && !/transparent|spacer|pixel\.gif/i.test(u.pathname) ? u.href : '';
      } catch {return '';}
    };
    // Amazon uses different main-image IDs for print, Kindle and newer layouts.
    for (const selector of ['#imgBlkFront','#ebooksImgBlkFront','#landingImage','#main-image','#mainImage','#frontImg','#imageBlock img.a-dynamic-image','#imageBlock_feature_div img.a-dynamic-image']) {
      for (const img of doc.querySelectorAll(selector)) {
        const urls=[img.getAttribute('data-old-hires'),img.getAttribute('data-a-hires')];
        try {
          const dynamic=JSON.parse(img.getAttribute('data-a-dynamic-image')||'{}');
          urls.push(...Object.entries(dynamic).sort((a,b)=>(Number(b[1]?.[0])*Number(b[1]?.[1])||0)-(Number(a[1]?.[0])*Number(a[1]?.[1])||0)).map(([url])=>url));
        } catch { /* Keep trying other image attributes. */ }
        urls.push(img.getAttribute('data-src'),img.currentSrc,img.getAttribute('src'));
        const url=urls.map(valid).find(Boolean);
        if(url)return {url,source:selector};
      }
    }
    for (const item of [].concat(book.image||[])) {
      const url=valid(typeof item==='string'?item:item?.contentUrl||item?.url);
      if(url)return {url,source:'Book metadata (JSON-LD)'};
    }
    for(const selector of ['meta[property="og:image"]','meta[name="twitter:image"]']) {
      const url=valid(doc.querySelector(selector)?.getAttribute('content'));
      if(url)return {url,source:'Page metadata'};
    }
    return {url:'',source:''};
  }

  function descriptionText(element) {
    function walk(node) {
      if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
      if (node.nodeType !== 1) return '';
      if (node.matches('script, style, [hidden], [aria-hidden="true"]')) return '';
      if (node.tagName === 'BR') return '\n';
      const text = [...node.childNodes].map(walk).join('');
      if (/^(P|DIV|SECTION|H[1-6]|BLOCKQUOTE|UL|OL)$/.test(node.tagName)) return '\n\n' + text + '\n\n';
      if (node.tagName === 'LI') return '\n' + text + '\n';
      return text;
    }
    return walk(element).replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function dateValue(s, region='de') {
    s = norm(s);
    let m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (!m) {
      const dottedDate = s.match(/\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/);
      const ymd=s.match(/(\d{4})\s*(?:年|\/)\s*(\d{1,2})\s*(?:月|\/)\s*(\d{1,2})/);
      const slash=s.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
      const words=s.replace(/(\d)(?:st|nd|rd|th|er)\b/g,'$1').replace(/\b(?:de|del|di)\b/g,' ').replace(/[.,]/g,' ').split(/\s+/).filter(Boolean);
      const monthPos=words.findIndex(w=>MONTHS.has(w));
      if (dottedDate) m = ['', dottedDate[3], dottedDate[2].padStart(2,'0'), dottedDate[1].padStart(2,'0')];
      else if(ymd)m=['',ymd[1],ymd[2].padStart(2,'0'),ymd[3].padStart(2,'0')];
      else if(slash) {
        // Canada uses both orders: do not silently choose an ambiguous date.
        if(region==='ca' && +slash[1]<=12 && +slash[2]<=12 && slash[1]!==slash[2])return '';
        const monthFirst=region==='com' || (region==='ca' && +slash[2]>12);
        m=['',slash[3],(monthFirst?slash[1]:slash[2]).padStart(2,'0'),(monthFirst?slash[2]:slash[1]).padStart(2,'0')];
      }
      else if(monthPos>=0) {
        const before=words[monthPos-1],after=words[monthPos+1];
        const day=/^\d{1,2}$/.test(before||'')?before:after;
        const year=words[monthPos+(/^[0-9]{1,2}$/.test(before||'')?1:2)];
        if(/^\d{1,2}$/.test(day||'') && /^\d{4}$/.test(year||''))m=['',year,String(MONTHS.get(words[monthPos])).padStart(2,'0'),day.padStart(2,'0')];
      }
    }
    if (!m) return '';
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(iso + 'T12:00:00Z');
    return Number.isFinite(+d) && d.toISOString().slice(0,10) === iso ? iso : '';
  }

  function isbnValue(s) {
    const v = clean(s).replace(/[^\dXx]/g,'').toUpperCase();
    if (/^\d{13}$/.test(v) && [...v].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0)%10 === 0) return v;
    if (/^\d{9}[\dX]$/.test(v) && [...v].reduce((n,c,i)=>n+(c==='X'?10:Number(c))*(10-i),0)%11 === 0) return v;
    return '';
  }

  function extract(doc, url) {
    const store=storeFor(url);
    const txt = selector => clean(doc.querySelector(selector)?.textContent);
    const warnings = [];
    const edition=selectedEdition(doc);
    if(edition.isAudiobook)warnings.push(AUDIO_WARNING);
    const details = new Map();
    for (const el of doc.querySelectorAll('#detailBullets_feature_div li, #productDetails_detailBullets_sections1 tr, #productDetails_techSpec_section_1 tr')) {
      const label = el.querySelector('.a-text-bold, th');
      if (!label) continue;
      const key = norm(label.textContent).replace(/\s*[:：]\s*$/, '');
      const td = el.querySelector('td');
      const copy = el.cloneNode(true);
      copy.querySelector('.a-text-bold, th')?.remove();
      details.set(key, clean(td ? td.textContent : copy.textContent).replace(/^:\s*/, ''));
    }
    const get = (...keys) => keys.map(k=>details.get(norm(k))).find(Boolean) || '';
    const books = [];
    function walk(x) {
      if (!x || typeof x !== 'object') return;
      if ([].concat(x['@type'] || []).some(t=>/^(Book|Product)$/.test(t))) books.push(x);
      if (Array.isArray(x)) x.forEach(walk);
      else if (x['@graph']) walk(x['@graph']);
    }
    for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
      try { walk(JSON.parse(el.textContent)); } catch { /* Other widgets may contain invalid JSON. */ }
    }
    const book = books.find(x=>[].concat(x['@type']).includes('Book')) || books[0] || {};
    const title = txt('#productTitle, #ebooksProductTitle') || clean(book.name);
    if (!title) throw new Error('No book title found. Wait for the book page to finish loading and try again.');
    let authors = [];
    for (const el of doc.querySelectorAll('#bylineInfo .author')) {
      const role = clean(el.querySelector('.contribution')?.textContent);
      if (role && !/\b(?:autor|author|auteur|autore|autrice|autora|schrijver|forfattare)\b|著/.test(norm(role))) continue;
      const name = clean(el.querySelector('a.a-link-normal, a.contributorNameID')?.textContent);
      if (name) authors.push(name);
    }
    if (!authors.length) authors = [].concat(book.author || []).map(a=>clean(typeof a === 'string' ? a : a.name));
    authors = unique(authors);
    if (!authors.length) warnings.push('Author not found; please add one before exporting.');
    const asin = clean(doc.querySelector('#ASIN, input[name="ASIN"]')?.value) || get('asin') || new URL(url).pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i)?.[1] || '';
    const isbnRaw = get('isbn-13','isbn-10') || book.isbn || '';
    const isbn = isbnValue(isbnRaw);
    if (isbnRaw && !isbn) warnings.push('Invalid ISBN; omitted from export.');
    const pubRaw = get('erscheinungstermin','veröffentlichungsdatum','publication date','release date','date de publication','date de parution','date de sortie','data di pubblicazione','fecha de publicación','data da publicação','data de publicação','publicatiedatum','utgivningsdatum','発売日','出版日期') || book.datePublished || '';
    const pubdate = dateValue(pubRaw,store.region);
    if (pubRaw && !pubdate) warnings.push(`Unrecognized date: ${pubRaw}`);
    const langRaw = clean(get('sprache','language','langue','lingua','idioma','taal','språk','言語','语种') || book.inLanguage);
    const language = languageValue(langRaw);
    if (langRaw && !language) warnings.push(`Unrecognized language: ${langRaw}`);
    const publisherRaw = get('herausgeber','verlag','publisher','éditeur','editeur','editore','editorial','editora','uitgever','utgivare','出版社') || (typeof book.publisher === 'object' ? book.publisher.name : book.publisher) || '';
    const publisher = clean(publisherRaw).replace(/\s*;.*$/, '').replace(/\s*\([^)]*\)\s*$/, '');
    const desc = doc.querySelector('#bookDescription_feature_div .a-expander-content') || doc.querySelector('#bookDescription_feature_div') || doc.querySelector('#productDescription');
    let description = desc ? descriptionText(desc) : '';
    if (!description && book.description) {
      const raw = String(book.description);
      if (/<\/?(?:p|div|br|span|ul|ol|li|b|i|strong|em)\b/i.test(raw)) {
        const container = doc.createElement('div');
        // Detached content: read text only; no source HTML is inserted into the page.
        const template = doc.createElement('template');
        template.innerHTML = raw;
        container.append(template.content);
        description = descriptionText(container);
      } else description = raw.replace(/\r\n?/g, '\n').trim();
    }
    const coverInfo = findCover(doc,book,url);
    const coverUrl = coverInfo.url;
    const tags = unique([...doc.querySelectorAll('#wayfinding-breadcrumbs_feature_div a')].map(el=>clean(el.textContent)).filter(x=>!['Bücher','Books','Livres','Libri','Libros','Livros','Boeken','Böcker','Kindle-Shop','Kindle Store','Boutique Kindle','Kindle-Shop','Kindle eBooks'].includes(x)));
    const seriesText = txt('#seriesBulletWidget_feature_div, #rpi-attribute-book_details-series');
    const seriesMatch = seriesText.match(/(?:Buch|Band|Book|Livre|Tome|Libro|Livro|Boek|Del)\s+(\d+(?:[.,]\d+)?)\s+(?:(?:von|of|sur|de|di|van|av)\s+\d+\s*:\s*|der Serie\s*:\s*)(.+)/i);
    if (seriesText && !seriesMatch) warnings.push('Please check the series information: ' + seriesText);
    return {title, authors, identifiers:{...(asin.match(/^[A-Z0-9]{10}$/i)?{[store.identifier]:asin.toUpperCase()}:{}), ...(isbn?{isbn}:{})}, publisher, pubdate, language, description, tags, series:seriesMatch?clean(seriesMatch[2]):'', seriesIndex:seriesMatch?Number(seriesMatch[1].replace(',','.')):null, coverUrl, coverDetectedBy:coverInfo.source, sourceUrl:asin.match(/^[A-Z0-9]{10}$/i)?`https://www.${store.host}/dp/${asin.toUpperCase()}`:url, warnings};
  }

  function toOPF(m) {
    if (!m || typeof m !== 'object') throw new Error('Metadata must be a JSON object.');
    if (m.tags != null && (!Array.isArray(m.tags) || m.tags.some(t=>typeof t !== 'string'))) throw new Error('Tags must be a list of strings.');
    if (m.identifiers != null && (typeof m.identifiers !== 'object' || Array.isArray(m.identifiers))) throw new Error('Identifiers must be an object.');
    if (typeof m.title !== 'string' || !clean(m.title) || !Array.isArray(m.authors) || !m.authors.length || m.authors.some(a=>typeof a !== 'string' || !clean(a))) throw new Error('A title and at least one author are required.');
    if (m.warnings != null && (!Array.isArray(m.warnings) || m.warnings.some(x=>typeof x!=='string'))) throw new Error('Warnings must be a list of strings.');
    if (m.pubdate && !dateValue(m.pubdate)) throw new Error('Date must be a valid date in YYYY-MM-DD format.');
    if (m.series && m.seriesIndex != null && (!Number.isFinite(Number(m.seriesIndex)) || Number(m.seriesIndex)<0)) throw new Error('Invalid series number.');
    const ids = Object.entries(m.identifiers || {}).filter(([,v])=>v);
    const primary = ids.length ? ids[0][1] : 'amazon-export';
    const rows = [`<dc:title>${xml(m.title)}</dc:title>`, ...m.authors.map(a=>`<dc:creator opf:role="aut">${xml(a)}</dc:creator>`), `<dc:identifier id="bookid">${xml(primary)}</dc:identifier>`, ...ids.map(([k,v])=>`<dc:identifier opf:scheme="${xml(k)}">${xml(v)}</dc:identifier>`)];
    for (const [key,tag] of [['publisher','publisher'],['pubdate','date'],['language','language']]) if (m[key]) rows.push(`<dc:${tag}>${xml(m[key])}</dc:${tag}>`);
    // calibre renders comments as HTML. Escape plain text once for HTML and again for XML.
    if (m.description) {
      const html = String(m.description).replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/)
        .map(p => '<p>' + xml(p).replace(/\n/g, '<br/>') + '</p>').join('\n');
      rows.push(`<dc:description>${xml(html)}</dc:description>`);
    }
    for (const tag of m.tags || []) if (clean(tag)) rows.push(`<dc:subject>${xml(tag)}</dc:subject>`);
    if (m.series) {
      rows.push(`<meta name="calibre:series" content="${xml(m.series)}"/>`);
      if (m.seriesIndex != null) rows.push(`<meta name="calibre:series_index" content="${xml(m.seriesIndex)}"/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="bookid">\n<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">\n${rows.join('\n')}\n</metadata>\n<manifest/>\n<spine/>\n</package>\n`;
  }

  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], {type}));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url), 30000);
  }

  async function nativeClipboard(opf) {
    if (!globalThis.ClipboardItem || !navigator.clipboard?.write) throw new Error('Clipboard API unavailable. Download the OPF and use the local helper.');
    if (ClipboardItem.supports && !ClipboardItem.supports(MIME)) throw new Error('The browser does not support the native calibre format. Download the OPF and use the local helper.');
    await navigator.clipboard.write([new ClipboardItem({[MIME]:new Blob([opf], {type:MIME})})]);
  }

  function coverHost(url) {
    const u = new URL(url);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !['m.media-amazon.com','images-eu.ssl-images-amazon.com','images-na.ssl-images-amazon.com'].includes(u.hostname)) throw new Error('This cover URL is not supported.');
    return u.href;
  }

  function loadCover(url) {
    return new Promise((resolve, reject) => {
      try {
        url = coverHost(url);
        if (typeof GM_xmlhttpRequest !== 'function') throw new Error('Please reinstall the complete userscript, including its cover permissions.');
        GM_xmlhttpRequest({method:'GET', url, anonymous:true, responseType:'arraybuffer', timeout:15000,
          onload: r => {
            try {
              if (r.status !== 200) throw new Error('Cover download failed: HTTP ' + r.status);
              coverHost(r.finalUrl || url);
              const bytes = new Uint8Array(r.response);
              if (!bytes.length || bytes.length > 8_000_000) throw new Error('Cover is empty or larger than 8 MB.');
              const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' :
                bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71 ? 'image/png' :
                String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP' ? 'image/webp' : '';
              if (!mime) throw new Error('Cover must be a JPEG, PNG or WebP image.');
              let binary = '';
              for (let i=0; i<bytes.length; i+=32768) binary += String.fromCharCode(...bytes.subarray(i,i+32768));
              resolve({mime, base64:btoa(binary)});
            } catch(e) { reject(e); }
          }, onerror:()=>reject(new Error('Could not download the cover.')),
          ontimeout:()=>reject(new Error('Cover download timed out.'))});
      } catch(e) { reject(e); }
    });
  }

  function show() {
    let model;
    try { model = extract(document, location.href); } catch (e) { alert(e.message); return; }
    document.getElementById('calibre-export-dialog')?.remove();
    const dialog = document.createElement('dialog'); dialog.id = 'calibre-export-dialog';
    dialog.style.cssText = 'box-sizing:border-box;width:min(940px,94vw);max-height:92vh;padding:24px;background:#fff;color:#18261f;border:1px solid #b8c8bd;border-radius:14px;z-index:2147483647;font:15px/1.5 system-ui;';
    const style = document.createElement('style');
    style.textContent = '#calibre-export-dialog *{box-sizing:border-box} #calibre-export-dialog::backdrop{background:#0007} #calibre-export-dialog h2{font-size:24px;margin:0 0 8px} #calibre-export-dialog label{display:block;font-weight:600} #calibre-export-dialog input:not([type=checkbox]),#calibre-export-dialog textarea{display:block;width:100%;padding:9px;border:1px solid #aab9af;border-radius:6px;background:white;color:#18261f;font:inherit;margin-top:4px} #calibre-export-dialog button{padding:9px 14px;margin:4px 6px 4px 0;border:1px solid #aab9af;border-radius:6px;background:#f3f6f4;color:#18261f;cursor:pointer;font:inherit} #calibre-export-dialog button:disabled{opacity:.5;cursor:wait} #calibre-export-dialog .ce-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px} #calibre-export-dialog .ce-wide{grid-column:1/-1} #calibre-export-dialog .ce-primary{background:#234b39;color:white;border-color:#234b39} #calibre-export-dialog details{margin:18px 0} #calibre-export-dialog summary{cursor:pointer;font-weight:600} @media(max-width:600px){#calibre-export-dialog .ce-fields{grid-template-columns:1fr}}';
    dialog.append(style);
    const heading = document.createElement('h2'); heading.textContent = 'Metadata for calibre'; dialog.append(heading);
    const help = document.createElement('p'); help.textContent = 'Source: '+storeFor(location.href).host+'. Review the metadata, then copy it. A title and author are required.'; dialog.append(help);
    const warnings = document.createElement('p'); warnings.style.cssText='color:#805213;background:#fff8e8;padding:10px;border-radius:6px'; dialog.append(warnings);
    const grid = document.createElement('div'); grid.className='ce-fields'; dialog.append(grid);
    const fields = {};
    function field(key, label, multiline=false, wide=false) {
      const wrap = document.createElement('label'); wrap.textContent=label; if (wide) wrap.className='ce-wide';
      const input = document.createElement(multiline ? 'textarea' : 'input'); input.setAttribute('aria-label',label);
      if (multiline) input.rows=key==='description'?9:2;
      fields[key]=input; wrap.append(input); grid.append(wrap);
    }
    field('title','Title',false,true); field('authors','Authors (one per line)',true); field('publisher','Publisher');
    field('series','Series'); field('seriesIndex','Series number'); field('pubdate','Publication date (YYYY-MM-DD)'); field('language','Language (e.g. eng or deu)');
    field('isbn','ISBN'); field('asin','Amazon-ASIN'); field('tags','Tags (one per line)',true,true); field('description','Description',true,true);
    const coverBox=document.createElement('section'); coverBox.style.cssText='margin:18px 0;padding:14px;background:#f3f6f4;border-radius:8px'; dialog.append(coverBox);
    const coverLabel=document.createElement('label'); const coverCheck=document.createElement('input'); coverCheck.type='checkbox'; coverLabel.append(coverCheck,document.createTextNode(' Include cover')); coverBox.append(coverLabel);
    const coverStatus=document.createElement('p'); coverStatus.textContent=model.coverUrl?'Cover URL found. Optionally download and include the cover.':'No cover URL found. This does not indicate a permissions error.'; coverBox.append(coverStatus);
    const coverPreview=document.createElement('img'); coverPreview.alt='Book cover preview'; coverPreview.style.cssText='display:none;max-width:120px;max-height:180px;object-fit:contain'; coverBox.append(coverPreview);
    let cover=null, coverSource='', coverLoading=false, coverSerial=0, expertDirty=false;
    const expert=document.createElement('details'); const summary=document.createElement('summary'); summary.textContent='Advanced (JSON)'; expert.append(summary); dialog.append(expert);
    const editor=document.createElement('textarea'); editor.setAttribute('aria-label','Metadata as JSON'); editor.rows=12; editor.style.fontFamily='monospace'; expert.append(editor);
    const status = document.createElement('p'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite'); status.textContent='Ready for review.';
    const actions=document.createElement('div'); actions.style.cssText='position:sticky;bottom:-24px;background:white;padding:12px 0;border-top:1px solid #d9e2dc'; dialog.append(actions);
    function button(label, action, parent=actions) { const b=document.createElement('button'); b.textContent=label; b.onclick=async()=>{try{await action();}catch(e){status.textContent=e.message;}}; parent.append(b); return b; }
    function fill() {
      for (const [k,input] of Object.entries(fields)) input.value = k==='authors'||k==='tags' ? (model[k]||[]).join('\n') : k==='isbn'||k==='asin' ? model.identifiers?.[k==='asin'?storeFor(model.sourceUrl||location.href).identifier:k]||'' : model[k]??'';
      editor.value=JSON.stringify(model,null,2);
      const notes=[...(model.warnings||[])];
      if (!clean(model.title)) notes.push('Title is missing.');
      if (!model.authors?.length) notes.push('Author is missing.');
      if (!model.description) notes.push('No description found.');
      warnings.textContent=notes.join(' • ') || 'Please check the edition, series information and tags against the book page.';
    }
    function read() {
      if (expertDirty) throw new Error('Please apply or discard your JSON changes first.');
      for (const [k,input] of Object.entries(fields)) {
        const value=input.value.trim();
        if (k==='isbn'||k==='asin') { const key=k==='asin'?storeFor(model.sourceUrl||location.href).identifier:k;model.identifiers ||= {}; if(value)model.identifiers[key]=value;else delete model.identifiers[key]; }
        else model[k]=k==='authors'||k==='tags'?value.split('\n').map(clean).filter(Boolean):k==='seriesIndex'?(value?Number(value.replace(',','.')):null):value;
      }
      editor.value=JSON.stringify(model,null,2); return model;
    }
    for (const input of Object.values(fields)) input.addEventListener('input',()=>{if(!expertDirty)read();});
    editor.addEventListener('input',()=>{expertDirty=true;for(const input of Object.values(fields))input.disabled=true;});
    button('Apply JSON changes',()=>{
      const next=JSON.parse(editor.value); toOPF(next);
      if (next.tags && !Array.isArray(next.tags)) throw new Error('Tags must be a list.');
      if (next.coverUrl!==model.coverUrl) {coverSerial++;cover=null;coverSource='';coverLoading=false;coverCheck.checked=false;coverPreview.style.display='none';coverStatus.textContent='Cover URL changed. Select the checkbox again to download it.';}
      model=next;expertDirty=false;for(const input of Object.values(fields))input.disabled=false;fill();status.textContent='JSON changes applied.';
    },expert);
    button('Discard JSON changes',()=>{expertDirty=false;for(const input of Object.values(fields))input.disabled=false;fill();},expert);
    coverCheck.addEventListener('change',async()=>{
      if (!coverCheck.checked) return;
      if (cover && coverSource===model.coverUrl) return;
      const serial=++coverSerial;coverLoading=true;coverStatus.textContent='Downloading cover …';
      try { const data=await loadCover(model.coverUrl);if(serial!==coverSerial || !dialog.isConnected)return;cover=data;coverSource=model.coverUrl;coverPreview.src=`data:${data.mime};base64,${data.base64}`;coverPreview.style.display='block';coverStatus.textContent='Cover downloaded. It will be included when copying.'; }
      catch(e) {if(serial===coverSerial){cover=null;coverStatus.textContent=e.message+' Uncheck the cover option to copy without a cover.';}}
      finally {if(serial===coverSerial)coverLoading=false;}
    });
    function payload() {
      const opf=toOPF(read());
      if (!coverCheck.checked) return opf;
      if (coverLoading) throw new Error('Please wait for the cover to finish downloading.');
      if (!cover || coverSource!==model.coverUrl) throw new Error('Cover unavailable. Download it again or uncheck “Include cover”.');
      return JSON.stringify({format:'calibre-amazon-export',version:1,opf,cover});
    }
    button('Find cover again',()=>{
      if(expertDirty)throw new Error('Please apply or discard your JSON changes first.');
      const fresh=extract(document,location.href);read();
      coverSerial++;cover=null;coverLoading=false;coverSource='';coverCheck.checked=false;coverPreview.style.display='none';
      model.coverUrl=fresh.coverUrl;model.coverDetectedBy=fresh.coverDetectedBy;editor.value=JSON.stringify(model,null,2);
      coverStatus.textContent=model.coverUrl?'Cover URL found. Select “Include cover”.':'Still no cover URL found. You can enter coverUrl manually in the advanced JSON editor.';
    },coverBox);
    button('Copy for calibre', async()=>{
      const text = payload();
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(text);
      } catch (e) {
        throw new Error('Could not copy (' + e.message + '). Allow browser clipboard access or download the OPF.');
      }
      status.textContent='Copied as text'+(coverCheck.checked?' (with cover)':' (without cover)')+'. In the local helper, click “Import from clipboard”, then use “Paste metadata” in calibre.';
    }).className='ce-primary';
    button('Download OPF', ()=>{const m=read(); const opf=toOPF(m); const name=String(m.identifiers?.[storeFor(m.sourceUrl||location.href).identifier] || 'amazon-metadata').replace(/[^a-zA-Z0-9_-]/g,'_'); download(opf,name+'.opf','application/oebps-package+xml'); status.textContent='OPF downloaded without a cover. In the helper, select “Open file …”. Use “Download package” to include a cover.';});
    button('Download package', ()=>{const text=payload();download(text,'amazon-export'+(coverCheck.checked?'.json':'.opf'),coverCheck.checked?'application/json':'application/oebps-package+xml');status.textContent='Package saved. Load it in the updated helper using “Open file …”.';});
    button('Save JSON', ()=>download(JSON.stringify(read(),null,2),'amazon-metadata.json','application/json'),expert);
    button('Test native clipboard', async()=>{await nativeClipboard(toOPF(read())); status.textContent='The browser reports success (metadata only, without a cover). Native format recognition still needs to be checked in calibre.';},expert);
    button('Close',()=>{coverSerial++;dialog.close();dialog.remove();}); actions.append(status);fill(); document.body.append(dialog); dialog.showModal();
  }

  function isBookProduct(doc, url) {
    if (!/\/(?:dp|gp\/product)\/[A-Z0-9]{10}(?:\/|$)/i.test(new URL(url).pathname) ||
        !clean(doc.querySelector('#productTitle, #ebooksProductTitle')?.textContent)) return false;
    // Only the product breadcrumb counts: search filters and navigation also contain Books.
    const categories = new Set(['Bücher','Books','Livres','Libri','Libros','Livros','Boeken','Böcker','本','洋書',
      'Kindle-Shop','Kindle Store','Kindle-Shop und eBooks','Boutique Kindle','Tienda Kindle','Loja Kindle',
      'Kindleストア','Kindle eBooks','eBooks Kindle','Ebook Kindle','Kindle E-böcker'].map(norm));
    return [...doc.querySelectorAll('#wayfinding-breadcrumbs_feature_div a, #wayfinding-breadcrumbs_container a')]
      .some(link => categories.has(norm(link.textContent)));
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = {clean, xml, dateValue, isbnValue, extract, toOPF, findCover, storeFor, languageValue, STORES, MIME, isBookProduct};
  else {
    const button = document.createElement('button');
    button.textContent='→ calibre'; button.id='calibre-amazon-export'; button.type='button';
    button.title='Export metadata to calibre'; button.onclick=show;
    const container=document.createElement('div'); container.id='calibre-export-entry'; container.append(button);
    const style=document.createElement('style');
    style.textContent='#calibre-export-entry{display:block;clear:both;margin:10px auto 14px;max-width:100%;box-sizing:border-box} #calibre-amazon-export{display:block;position:static;box-sizing:border-box;width:100%;min-height:32px;padding:5px 12px;border:1px solid #234b39;border-radius:20px;background:#234b39;color:#fff;font:inherit;font-size:13px;line-height:20px;text-align:center;cursor:pointer;box-shadow:0 2px 5px #0f111126} #calibre-amazon-export:hover{background:#193c2c} #calibre-amazon-export:focus-visible{outline:3px solid #007185;outline-offset:3px}';
    document.head.append(style);
    const visible=element=>element && element.getBoundingClientRect().width>0 && element.getBoundingClientRect().height>0;
    let observedCover=null, pending=false;
    const resizeObserver=new ResizeObserver(()=>schedule());
    function place() {
      pending=false;
      if(!isBookProduct(document,location.href)) {
        container.remove();resizeObserver.disconnect();observedCover=null;return;
      }
      const cover=[...document.querySelectorAll('#landingImage, #imgBlkFront, #ebooksImgBlkFront, #main-image, #mainImage, #frontImg')].find(visible);
      const column=cover?.closest('#leftCol') || document.querySelector('#leftCol');
      const samples=column && [...column.querySelectorAll('[id^="desktop-below-image-block"]')].filter(visible).pop();
      const media=cover?.closest('#mediaBlock_feature_div, #imageBlock_feature_div, #imageBlock, #main-image-container') || cover?.closest('a, [role="button"]') || cover;
      const anchor=samples || media || document.querySelector('#titleSection, #productTitle, #ebooksProductTitle');
      if(!anchor){container.remove();return;}
      // Stay outside Amazon's clickable image and sample-player controls.
      if(anchor.nextElementSibling!==container)anchor.after(container);
      const width=cover?.getBoundingClientRect().width;
      const desiredWidth=width?`${width}px`:'240px';
      if(container.style.width!==desiredWidth)container.style.width=desiredWidth;
      if(cover!==observedCover){resizeObserver.disconnect();observedCover=cover;if(cover)resizeObserver.observe(cover);}
    }
    function schedule(){if(!pending){pending=true;requestAnimationFrame(place);}}
    // Amazon can insert or replace the cover/sample area after initial page load.
    new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize',schedule);
    place();
  }
})();
