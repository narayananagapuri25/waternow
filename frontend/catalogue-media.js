(function(){
  const image=(type,id,entity)=>{
    const item=entity&&typeof entity==='object'?entity:{};
    const url=String(item.image_url||'').trim();
    if(url)return url;
    if(item.image_data&&item.image_mime_type)return 'data:'+item.image_mime_type+';base64,'+item.image_data;
    return '';
  };
  window.WaterNowCatalogueMedia=Object.freeze({image});
})();
