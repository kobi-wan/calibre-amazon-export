const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../calibre-amazon-export.user.js');

test('Regional dates, months, language and identifier mapping',()=>{
  for(const [value,region,want] of [
    ['October 1, 2026','com','2026-10-01'],['1 October 2026','uk','2026-10-01'],
    ['1 octobre 2026','fr','2026-10-01'],['1 de outubro de 2026','br','2026-10-01'],
    ['1 de octubre de 2026','es','2026-10-01'],['1 ottobre 2026','it','2026-10-01'],
    ['1 oktober 2026','nl','2026-10-01'],['2026年10月1日','jp','2026-10-01'],
    ['10/01/2026','com','2026-10-01'],['10/01/2026','uk','2026-01-10'],
    ['February 30, 2026','com',''],['10/01/2026','ca',''],['10/20/2026','ca','2026-10-20']
  ]) assert.equal(api.dateValue(value,region),want,value);
  for(const word of ['English','Anglais','Inglês','Inglés','Englisch','en-US'])assert.equal(api.languageValue(word),'eng');
  assert.equal(api.languageValue('日本語'),'jpn');
  assert.equal(api.languageValue('unknown'),'');
  for(const [host,region] of Object.entries(api.STORES))assert.equal(api.storeFor('https://www.'+host+'/dp/B0GJM9YRPS').identifier,region==='com'?'amazon':'amazon_'+region);
  assert.throws(()=>api.storeFor('https://amazon.com.example.org/dp/test'));
});

test('German dates and invalid dates',()=>{
  assert.equal(api.dateValue('15. März 2024'),'2024-03-15');
  assert.equal(api.dateValue('20.11.2020'),'2020-11-20');
  assert.equal(api.dateValue('31. Februar 2024'),'');
  assert.equal(api.dateValue('2024-99-99'),'');
  assert.equal(api.dateValue('2024'),'');
});
test('ISBN checksums',()=>{
  assert.equal(api.isbnValue('978-3-16-148410-0'),'9783161484100');
  assert.equal(api.isbnValue('0-306-40615-2'),'0306406152');
  assert.equal(api.isbnValue('9783161484101'),'');
});
test('OPF preserves Unicode and escapes XML',()=>{
  const m={title:'Die Prüfung & das Rätsel', authors:['Anna Müller'], identifiers:{amazon_de:'B08NWCLGCV',isbn:'9783161484100'},publisher:'Test & Sohn',pubdate:'2024-03-15',language:'deu',description:'Ein Rätsel & ein <Geheimnis>.',tags:['Krimis & Thriller'],series:'Die Prüfungen',seriesIndex:2};
  const opf=api.toOPF(m);
  assert.match(opf,/Die Prüfung &amp; das Rätsel/);
  assert.match(opf,/&amp;lt;Geheimnis&amp;gt;/);
  assert.match(opf,/opf:scheme="amazon_de"/);
  assert.match(opf,/calibre:series_index" content="2"/);
  fs.mkdirSync(path.join(__dirname,'output'),{recursive:true});
  fs.writeFileSync(path.join(__dirname,'output','sample.opf'),opf);
});
test('Incomplete records fail before export',()=>{
  assert.throws(()=>api.toOPF({title:'Missing author',authors:[]}),/author/);
  assert.throws(()=>api.toOPF({title:'Title',authors:['A'],pubdate:'2024-02-31'}),/Date/);
});
