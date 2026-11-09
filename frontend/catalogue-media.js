(function(){
  const catalogue=Object.freeze({
    'water-20l':'/frontend/media/catalogue/water-20l.svg',
    'water-10l-pair':'/frontend/media/catalogue/water-10l-pair.svg'
  });
  const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase('en-IN').replace(/[^a-z0-9]+/g,' ').trim();
  const image=(type,id,entity)=>{
    const direct=catalogue[String(id)];
    if(direct)return direct;
    const key=normalize(entity?.slug||'')+' '+normalize(entity?.name||'');
    if(/20l|20 litre|20 liter|twenty litre/.test(key))return catalogue['water-20l'];
    if(/10l|10 litre|10 liter|two 10l|2 10l/.test(key))return catalogue['water-10l-pair'];
    return '';
  };
  window.WaterNowCatalogueMedia=Object.freeze({image});
})();
