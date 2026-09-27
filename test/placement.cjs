const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>route.fulfill({body:'<html></html>',contentType:'text/html'}));
  await page.goto('https://www.amazon.com/dp/B00I3PUCIY/');
  await page.setContent(`<style>#leftCol{width:300px;text-align:center}#landingImage{display:block;width:240px;height:360px;margin:auto;background:#ddd}button{border-radius:20px;padding:6px 20px}</style><div id="leftCol"><div id="mediaBlock_feature_div"><div role="button"><img id="landingImage" alt="Book cover"></div></div><div id="desktop-below-image-block_Ebooks"><button>Read sample</button><button>Listen</button></div></div><h1 id="productTitle">Test book</h1>`);
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../calibre-amazon-export.user.js'),'utf8')});
  assert.equal(await page.locator('#calibre-amazon-export').count(),0);
  await page.evaluate(()=>document.body.insertAdjacentHTML('afterbegin','<div id="wayfinding-breadcrumbs_feature_div"><a>Books</a></div>'));
  await page.waitForSelector('#calibre-amazon-export');
  const state=()=>page.evaluate(()=>{
   const button=document.querySelector('#calibre-amazon-export'), entry=button.parentElement;
   return {count:document.querySelectorAll('#calibre-amazon-export').length,previous:entry.previousElementSibling.id,width:button.getBoundingClientRect().width,position:getComputedStyle(button).position,color:getComputedStyle(button).color};
  });
  assert.deepEqual(await state(),{count:1,previous:'desktop-below-image-block_Ebooks',width:240,position:'static',color:'rgb(255, 255, 255)'});
  await page.screenshot({path:path.join(__dirname,'output/placement.png')});
  await page.evaluate(()=>document.querySelector('#landingImage').style.width='180px');
  await page.waitForFunction(()=>document.querySelector('#calibre-amazon-export').getBoundingClientRect().width===180);
  await page.evaluate(()=>document.querySelector('#desktop-below-image-block_Ebooks').remove());
  await page.waitForFunction(()=>document.querySelector('#calibre-export-entry').previousElementSibling.id==='mediaBlock_feature_div');
  await page.evaluate(()=>document.querySelector('#mediaBlock_feature_div').insertAdjacentHTML('afterend','<div id="desktop-below-image-block_Books"><button>Listen</button></div>'));
  await page.waitForFunction(()=>document.querySelector('#calibre-export-entry').previousElementSibling.id==='desktop-below-image-block_Books');
  assert.equal((await state()).count,1);
  await page.click('#calibre-amazon-export');
  assert.equal(await page.locator('dialog').count(),1);
  await page.evaluate(()=>document.querySelector('#wayfinding-breadcrumbs_feature_div a').textContent='Electronics');
  await page.waitForSelector('#calibre-amazon-export',{state:'detached'});
  console.log('PASS: below samples, cover width, resize, absent and delayed samples, single button, export dialog');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
