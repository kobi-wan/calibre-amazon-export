// Runs in a disposable browser, never in the user's browser profile.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'msedge'});
  try {
    console.log('Browser:',await browser.version());
    const page=await browser.newPage({viewport:{width:1280,height:1200}});
    const source=fs.readFileSync(path.join(__dirname,'../calibre-amazon-export.user.js'),'utf8');
    async function parse(name,url='https://www.amazon.de/dp/B08NWCLGCV') {
      await page.setContent(fs.readFileSync(path.join(__dirname,'fixtures',name),'utf8'));
      await page.addScriptTag({content:'var module={exports:{}};\n'+source});
      return page.evaluate(url=>module.exports.extract(document,url),url);
    }
    const p=await parse('paperback.html');
    const eligibility=await page.evaluate(()=>{
      const check=(category,url='https://www.amazon.de/dp/B08NWCLGCV',title=true)=>module.exports.isBookProduct(new DOMParser().parseFromString(`${title?'<h1 id="productTitle">Test</h1>':''}<nav><a>Books</a></nav><select><option selected>Kindle Store</option></select><div id="wayfinding-breadcrumbs_feature_div"><a>${category}</a></div>`,'text/html'),url);
      return [check('Bücher'),check('Kindle-Shop'),check('Books'),check('Livres'),check('Kindleストア'),check('Electronics'),check(''),check('Books','https://www.amazon.de/s?k=books'),check('Books','https://www.amazon.de/dp/B08NWCLGCV',false)];
    });
    assert.deepEqual(eligibility,[true,true,true,true,true,false,false,false,false]);
    assert.equal(p.title,'Die Prüfung & das Rätsel');
    assert.deepEqual(p.authors,['Anna Müller']);
    assert.equal(p.publisher,'Test & Sohn');
    assert.equal(p.pubdate,'2024-03-15');
    assert.equal(p.identifiers.isbn,'9783161484100');
    assert.equal(p.language,'deu');
    assert.equal(p.series,'Die Prüfungen');
    assert.equal(p.seriesIndex,2);
    assert.deepEqual(p.tags,['Krimis & Thriller']);
    assert.equal(p.description,'Ein Rätsel & ein <Geheimnis>.\nEine zweite Zeile.\n\nEin neuer Absatz.');
    const k=await parse('kindle.html');
    assert.deepEqual(k.authors,['Max Beispiel']);
    assert.equal(k.pubdate,'2020-11-20');
    assert.equal(k.publisher,'Beispielverlag');
    assert.equal(k.identifiers.amazon_de,'B08NWCLGCV');
    const coverResults=await page.evaluate(()=>{
      const find=html=>module.exports.findCover(new DOMParser().parseFromString(html,'text/html'),{},'https://www.amazon.de/dp/B08NWCLGCV').url;
      return [
        find('<img id="landingImage" src="data:image/gif;base64,R0lG" data-a-dynamic-image=\'{"https://m.media-amazon.com/small.jpg":[100,150],"https://m.media-amazon.com/large.jpg":[1000,1500]}\'>'),
        find('<img id="main-image" src="https://m.media-amazon.com/main.jpg">'),
        find('<meta property="og:image" content="https://m.media-amazon.com/meta.jpg">'),
        module.exports.findCover(document,{image:{contentUrl:'https://m.media-amazon.com/structured.jpg'}},'https://www.amazon.de').url,
        find('<img id="imgBlkFront" src="data:image/gif;base64,R0lG"><img id="landingImage" data-src="https://m.media-amazon.com/lazy.jpg">')
      ];
    });
    assert.deepEqual(coverResults,['large','main','meta','structured','lazy'].map(x=>'https://m.media-amazon.com/'+x+'.jpg'));
    const actualLayout=await parse('kindle-landing-image.html');
    assert.equal(actualLayout.coverUrl,'https://m.media-amazon.com/images/I/81S6kn8XnXL._SL1500_.jpg');
    assert.equal(actualLayout.coverDetectedBy,'#landingImage');
    const audio=await parse('audiobook.html','https://www.amazon.com/dp/B00I3PUCIY/');
    assert.match(audio.warnings[0],/^Audiobook selected:/);
    assert.deepEqual(audio.authors,['Pierce Brown']);
    const mediumTests=await page.evaluate(()=>{
      const parse=html=>module.exports.extract(new DOMParser().parseFromString('<span id="productTitle">Test</span>'+html,'text/html'),'https://www.amazon.com/dp/B00I3PUCIY/').warnings.some(x=>x.startsWith('Audiobook selected:'));
      return [
        parse('<div id="tmmSwatches"><a aria-checked="true"><span class="slot-title">Kindle</span></a><a aria-checked="false">Audiobook</a></div><div id="bylineInfo">Format: Audible Audiobook</div>'),
        parse('<div id="bylineInfo">Format: Audible Audiobook</div>'),
        parse('<div id="tmmSwatches"><div class="swatchElement selected">Hörbuch</div></div>'),
        parse('<div id="recommendations">Audiobook Audible Hörbuch</div>'),
        parse('<div id="bylineInfo">Format: Kindle Edition</div>')
      ];
    });
    assert.deepEqual(mediumTests,[false,true,true,false,false]);
    const us=await parse('us-kindle.html','https://www.amazon.com/dp/B0GJM9YRPS');
    assert.equal(us.title,'Death by Misadventure: A Novel');
    assert.deepEqual(us.authors,['Jane Bitomsky']);
    assert.equal(us.publisher,'Lake Union Publishing');
    assert.equal(us.pubdate,'2026-10-01');
    assert.equal(us.language,'eng');
    assert.equal(us.identifiers.amazon,'B0GJM9YRPS');
    assert.equal(us.identifiers.amazon_de,undefined);
    assert.equal(us.identifiers.isbn,'9781662540578');
    assert.equal(us.sourceUrl,'https://www.amazon.com/dp/B0GJM9YRPS');
    assert.match(us.coverUrl,/81esfIaAfVL/);
    const regional=await page.evaluate(()=>{
      const variants=[
        ['fr','Auteur','Éditeur','Date de publication','Langue','1 octobre 2026','Anglais'],
        ['it','Autore','Editore','Data di pubblicazione','Lingua','1 ottobre 2026','Inglese'],
        ['es','Autor','Editorial','Fecha de publicación','Idioma','1 de octubre de 2026','Inglés'],
        ['com.br','Autor','Editora','Data da publicação','Idioma','1 de outubro de 2026','Inglês'],
        ['co.jp','著','出版社','発売日','言語','2026年10月1日','英語']
      ];
      return variants.map(([domain,role,pub,date,lang,value,language])=>{
        const html=`<span id="productTitle">Test</span><div id="bylineInfo"><span class="author"><a class="a-link-normal">Person</a><span class="contribution">(${role})</span></span></div><div id="detailBullets_feature_div"><ul><li><b class="a-text-bold">${pub}:</b>Testverlag</li><li><b class="a-text-bold">${date}:</b>${value}</li><li><b class="a-text-bold">${lang}:</b>${language}</li></ul></div>`;
        return module.exports.extract(new DOMParser().parseFromString(html,'text/html'),'https://www.amazon.'+domain+'/dp/B0GJM9YRPS');
      });
    });
    for(const item of regional){assert.equal(item.publisher,'Testverlag');assert.equal(item.pubdate,'2026-10-01');assert.equal(item.language,'eng');assert.deepEqual(item.authors,['Person']);}
    await page.setContent('<h1>Captcha</h1>');
    await assert.rejects(()=>page.evaluate(()=>module.exports.extract(document,'https://www.amazon.de/dp/B08NWCLGCV')),/No book title/);
    // Real UI, OPF download, editor validation, fallback messaging.
    // Synthetic HTTPS origin, every request intercepted locally (no Amazon request).
    await page.route('**/*',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(__dirname,'fixtures','paperback.html'),'utf8')}));
    await page.goto('https://www.amazon.de/dp/B08NWCLGCV');
    await page.addScriptTag({content:'module=undefined;\n'+source});
    console.log('Clipboard support:',await page.evaluate(()=>({secure:isSecureContext,native:ClipboardItem.supports('application/calibre-book-metadata'),webCustom:ClipboardItem.supports('web application/calibre-book-metadata')})));
    await page.click('#calibre-amazon-export');
    assert.equal(await page.locator('dialog').count(),1);
    assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),'Die Prüfung & das Rätsel');
    assert.match(await page.getByLabel('Description',{exact:true}).inputValue(),/\n\nEin neuer Absatz/);
    await page.getByLabel('Title',{exact:true}).fill('Korrigierter Titel');
    assert.match(await page.getByLabel('Metadata as JSON').inputValue(),/Korrigierter Titel/);
    await page.getByLabel('Title',{exact:true}).fill('Die Prüfung & das Rätsel');
    // Capture writes without replacing the user's Windows clipboard in this browser test.
    await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async text=>{window.copiedOPF=text;}}));
    await page.getByText('Copy for calibre',{exact:true}).click();
    const copied=await page.evaluate(()=>window.copiedOPF);
    assert.match(copied,/<dc:title>Die Prüfung &amp; das Rätsel<\/dc:title>/);
    assert.match(await page.locator('[role=status]').textContent(),/Copied as text/);
    const [download]=await Promise.all([page.waitForEvent('download'),page.getByText('Download OPF',{exact:true}).click()]);
    fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
    await download.saveAs(path.join(__dirname,'output','browser.opf'));
    assert.match(fs.readFileSync(path.join(__dirname,'output','browser.opf'),'utf8'),/Anna Müller/);
    assert.equal(copied,fs.readFileSync(path.join(__dirname,'output','browser.opf'),'utf8'));
    assert.match(copied,/&lt;br\/&gt;Eine zweite Zeile/);
    assert.match(copied,/&lt;p&gt;Ein neuer Absatz\.&lt;\/p&gt;/);
    await page.getByLabel('Include cover',{exact:true}).check();
    await page.getByText(/This cover URL is not supported/).waitFor();
    await page.getByText('Copy for calibre',{exact:true}).click();
    assert.match(await page.locator('[role=status]').textContent(),/Cover unavailable/);
    await page.getByLabel('Include cover',{exact:true}).uncheck();
    await page.getByText('Advanced (JSON)',{exact:true}).click();
    // Change only cover URL in expert mode, apply, then use a synthetic image response.
    const metadata=JSON.parse(await page.getByLabel('Metadata as JSON').inputValue());
    metadata.coverUrl='https://m.media-amazon.com/images/I/test-cover.jpg';
    await page.getByLabel('Metadata as JSON').fill(JSON.stringify(metadata));
    await page.getByText('Apply JSON changes',{exact:true}).click();
    await page.getByText('Advanced (JSON)',{exact:true}).click();
    await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=120;canvas.height=180;
      const ctx=canvas.getContext('2d');ctx.fillStyle='#234b39';ctx.fillRect(0,0,120,180);ctx.fillStyle='white';ctx.font='14px sans-serif';ctx.fillText('TEST-COVER',12,90);
      const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),c=>c.charCodeAt(0));
      window.GM_xmlhttpRequest=opts=>setTimeout(()=>opts.onload({status:200,finalUrl:opts.url,response:bytes.buffer}),20);
    });
    await page.getByLabel('Include cover',{exact:true}).check();
    await page.getByText('Cover downloaded. It will be included when copying.',{exact:true}).waitFor();
    await page.getByText('Copy for calibre',{exact:true}).click();
    const packet=JSON.parse(await page.evaluate(()=>window.copiedOPF));
    assert.equal(packet.format,'calibre-amazon-export');assert.equal(packet.opf,copied);assert.equal(packet.cover.mime,'image/png');
    fs.writeFileSync(path.join(__dirname,'output','cover-packet.json'),JSON.stringify(packet));
    const [packageDownload]=await Promise.all([page.waitForEvent('download'),page.getByText('Download package',{exact:true}).click()]);
    await packageDownload.saveAs(path.join(__dirname,'output','downloaded-packet.json'));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(__dirname,'output','downloaded-packet.json'),'utf8')),packet);
    await page.locator('dialog').evaluate(el=>{el.scrollTop=0;});
    await page.screenshot({path:path.join(__dirname,'output','preview.png')});
    await page.setViewportSize({width:540,height:900});
    assert.ok(await page.locator('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
    await page.screenshot({path:path.join(__dirname,'output','preview-small.png')});
    await page.setViewportSize({width:1280,height:1200});
    await page.getByLabel('Include cover',{exact:true}).uncheck();
    await page.getByText('Copy for calibre',{exact:true}).click();
    assert.equal(await page.evaluate(()=>window.copiedOPF),copied);
    await page.evaluate(()=>Object.defineProperty(navigator.clipboard,'writeText',{configurable:true,value:async()=>{throw new DOMException('Test denied','NotAllowedError');}}));
    await page.getByText('Copy for calibre',{exact:true}).click();
    assert.match(await page.locator('[role=status]').textContent(),/Could not copy.*download the OPF/);
    await page.getByText('Advanced (JSON)',{exact:true}).click();
    await page.getByText('Test native clipboard',{exact:true}).click();
    assert.match(await page.locator('[role=status]').textContent(),/Clipboard API unavailable|does not support the native calibre format/);
    await page.getByLabel('Metadata as JSON').fill('{}');
    await page.getByText('Apply JSON changes',{exact:true}).click();
    assert.match(await page.locator('[role=status]').textContent(),/title/);
    // Separate US form: editing ASIN must keep the correct identifier type.
    await page.unroute('**/*');
    await page.route('**/*',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(__dirname,'fixtures','us-kindle.html'),'utf8')}));
    await page.goto('https://www.amazon.com/dp/B0GJM9YRPS');
    await page.addScriptTag({content:'module=undefined;\n'+source});
    await page.click('#calibre-amazon-export');
    assert.equal(await page.getByLabel('Amazon-ASIN',{exact:true}).inputValue(),'B0GJM9YRPS');
    await page.getByLabel('Amazon-ASIN',{exact:true}).fill('B0GJM9YRPX');
    await page.getByLabel('Amazon-ASIN',{exact:true}).fill('B0GJM9YRPS');
    const [usDownload]=await Promise.all([page.waitForEvent('download'),page.getByText('Download OPF',{exact:true}).click()]);
    assert.equal(usDownload.suggestedFilename(),'B0GJM9YRPS.opf');
    await usDownload.saveAs(path.join(__dirname,'output','us.opf'));
    const usOPF=fs.readFileSync(path.join(__dirname,'output','us.opf'),'utf8');
    assert.match(usOPF,/opf:scheme="amazon">B0GJM9YRPS/);assert.doesNotMatch(usOPF,/amazon_de/);
    await page.unroute('**/*');
    await page.route('**/*',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(__dirname,'fixtures','audiobook.html'),'utf8')}));
    await page.goto('https://www.amazon.com/dp/B00I3PUCIY/');
    await page.addScriptTag({content:'module=undefined;\n'+source});
    await page.click('#calibre-amazon-export');
    assert.equal(await page.getByText(/^Audiobook selected:/).isVisible(),true);
    const [audioDownload]=await Promise.all([page.waitForEvent('download'),page.getByText('Download OPF',{exact:true}).click()]);
    assert.equal(audioDownload.suggestedFilename(),'B00I3PUCIY.opf');
    console.log('PASS: paperback, Kindle, CAPTCHA, OPF download, clipboard fallback, invalid editor data');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
