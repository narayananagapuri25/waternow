(function(){
  const catalogue=Object.freeze({
    'water-20l':'https://www.aquacoolthrissur.com/images/products/packaged-mineral-water-20l-can-thrissur.png',
    'water-10l-pair':'https://www.bbassets.com/media/uploads/p/l/40366456_1-bailley-bailley-packaged-drinking-water.jpg'
  });
  const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('en-IN').replace(/[^a-z0-9]+/g,' ').trim();
  const image=(type,id,entity)=>{
    if(type==='products'&&catalogue[String(id)])return catalogue[String(id)];
    const key=normalize(entity?.slug||'')+' '+normalize(entity?.name||'');
    if(/20l|20 litre|20 liter/.test(key))return catalogue['water-20l'];
    if(/10l|10 litre|10 liter/.test(key))return catalogue['water-10l-pair'];
    if(type==='products'){
      const name=normalize(entity?.name);
      if(name.includes('20l'))return catalogue['water-20l'];
      if(name.includes('10l'))return catalogue['water-10l-pair'];
    }
    return '';
  };
  window.FreshWayCatalogueMedia=Object.freeze({image});
})();