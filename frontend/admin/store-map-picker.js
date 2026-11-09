(function(){
  const CSS_URL='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  const JS_URL='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
  let leafletPromise=null;
  const style=document.createElement('style');
  style.textContent='.fw-store-map-picker{margin:12px 0 18px;padding:14px;border:1px solid #dfe9e2;border-radius:15px;background:#fbfdfb}.fw-store-map-tools{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin-bottom:12px}.fw-store-map-tools .settings-field{margin:0}.fw-store-map-tools>div{display:flex;gap:8px;flex-wrap:wrap}.fw-store-map-tools button{min-height:42px;white-space:nowrap}.fw-store-map-canvas{width:100%;height:290px;min-height:240px;border:1px solid #dce7df;border-radius:13px;overflow:hidden;background:#edf3ef;z-index:0}.fw-store-map-status{margin:10px 0 0;font-size:12px;line-height:1.5}.fw-store-map-picker .leaflet-container{font:inherit}@media(max-width:560px){.fw-store-map-picker{padding:10px}.fw-store-map-tools{grid-template-columns:1fr}.fw-store-map-tools>div{display:grid;grid-template-columns:1fr 1fr}.fw-store-map-tools button{width:100%;padding:9px 8px;font-size:12px}.fw-store-map-canvas{height:260px;min-height:230px}}';
  document.head.appendChild(style);

  function loadLeaflet(){
    if(window.L)return Promise.resolve(window.L);
    if(leafletPromise)return leafletPromise;
    leafletPromise=new Promise((resolve,reject)=>{
      if(!document.querySelector('link[data-waternow-leaflet]')){
        const link=document.createElement('link');
        link.rel='stylesheet';link.href=CSS_URL;link.dataset.waternowLeaflet='1';
        document.head.appendChild(link);
      }
      const existing=document.querySelector('script[data-waternow-leaflet]');
      if(existing){
        existing.addEventListener('load',()=>resolve(window.L),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Map library could not be loaded.')),{once:true});
        if(window.L)resolve(window.L);
        return;
      }
      const script=document.createElement('script');
      script.src=JS_URL;script.async=true;script.dataset.waternowLeaflet='1';
      script.onload=()=>window.L?resolve(window.L):reject(new Error('Map library did not initialise.'));
      script.onerror=()=>reject(new Error('Map library could not be loaded. Check your internet connection and retry.'));
      document.head.appendChild(script);
    }).catch(error=>{leafletPromise=null;throw error;});
    return leafletPromise;
  }

  const validPair=(lat,lon)=>{
    const a=Number(lat),b=Number(lon);
    return String(lat??'').trim()!==''&&String(lon??'').trim()!==''&&
      Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180&&!(a===0&&b===0);
  };

  function mount(root){
    if(!root)return()=>{};
    let map=null,marker=null,circle=null,disposed=false,lookupBusy=false;
    const form=root.closest('form');
    const mapNode=root.querySelector('[data-store-map-canvas]');
    const latitude=form?.querySelector('[name="latitude"]');
    const longitude=form?.querySelector('[name="longitude"]');
    const radius=form?.querySelector('[name="radius"]');
    const address=form?.querySelector('[name="address"]');
    const search=root.querySelector('[data-map-search-input]');
    const searchButton=root.querySelector('[data-map-search-button]');
    const currentButton=root.querySelector('[data-map-current-location]');
    const status=root.querySelector('[data-map-status]');
    const setStatus=message=>{if(status)status.textContent=message;};
    const radiusMetres=()=>Math.max(100,Math.min(100000,Number(radius?.value||5)*1000));
    const cleanup=()=>{
      disposed=true;
      if(map){map.off();map.remove();map=null;}
    };
    if(!mapNode||!latitude||!longitude){setStatus('Map controls could not be initialised. Refresh the page and try again.');return cleanup;}

    function setPin(lat,lon,{pan=true}={}){
      const point=[Number(lat),Number(lon)];
      if(!Number.isFinite(point[0])||!Number.isFinite(point[1])||Math.abs(point[0])>90||Math.abs(point[1])>180)return;
      latitude.value=point[0].toFixed(6);
      longitude.value=point[1].toFixed(6);
      if(!marker){marker=window.L.marker(point,{draggable:true}).addTo(map);marker.on('dragend',pinFromMarker);}
      else marker.setLatLng(point);
      if(!circle)circle=window.L.circle(point,{radius:radiusMetres(),color:'#087b52',weight:2,fillColor:'#13a36c',fillOpacity:.12}).addTo(map);
      else{circle.setLatLng(point);circle.setRadius(radiusMetres());}
      if(pan)map.setView(point,Math.max(map.getZoom(),16));
      setStatus('Store pin selected. Drag the marker to fine-tune the exact location. The delivery circle shows the current '+(radius?.value||5)+' km radius.');
    }
    function updateRadius(){
      if(circle)circle.setRadius(radiusMetres());
      if(marker)setStatus('Store pin selected. Delivery eligibility radius: '+(radius?.value||5)+' km.');
    }
    function pinFromMarker(){
      if(!marker)return;
      const p=marker.getLatLng();setPin(p.lat,p.lng,{pan:false});
    }
    function searchLocation(){
      if(lookupBusy)return;
      const query=String(address?.value||search?.value||'').trim();
      if(!query){setStatus('Enter the store address first, then select Find on map.');return;}
      lookupBusy=true;
      if(searchButton)searchButton.disabled=true;
      setStatus('Finding this address on the map…');
      fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent(query),{
        method:'GET',headers:{'Accept':'application/json'}
      }).then(response=>{
        if(!response.ok)throw new Error('Address search is temporarily unavailable.');
        return response.json();
      }).then(results=>{
        if(!Array.isArray(results)||!results.length)throw new Error('Address not found. Zoom in and tap the exact shop location on the map.');
        const result=results[0];setPin(result.lat,result.lon);
        setStatus('Address found: '+String(result.display_name||query)+'. Check the pin and drag it to the exact shop entrance.');
      }).catch(error=>setStatus(error.message||'Could not find that address. Tap the map to place the pin manually.'))
      .finally(()=>{lookupBusy=false;if(searchButton)searchButton.disabled=false;});
    }

    loadLeaflet().then(L=>{
      if(disposed||!root.isConnected)return;
      const hasPin=validPair(latitude.value,longitude.value);
      const initial=hasPin?[Number(latitude.value),Number(longitude.value)]:[17.405,78.585];
      map=L.map(mapNode,{scrollWheelZoom:false}).setView(initial,hasPin?16:13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);
      if(hasPin){
        setPin(initial[0],initial[1],{pan:false});
        if(/approximate locality pin/i.test(String(address?.value||''))){
          setStatus('This is an approximate locality-centre pin, not a verified shop entrance. Move the marker to the exact shop location and update the address before activating delivery.');
        }
      }
      map.on('click',event=>setPin(event.latlng.lat,event.latlng.lng));
      radius?.addEventListener('input',updateRadius);
      searchButton?.addEventListener('click',searchLocation);
      search?.addEventListener('input',()=>{if(address)address.value=search.value;});
      address?.addEventListener('input',()=>{if(search)search.value=address.value;});
      search?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchLocation();}});
      currentButton?.addEventListener('click',()=>{
        if(!navigator.geolocation){setStatus('Your browser does not support current-location detection. Tap the map to place the pin.');return;}
        currentButton.disabled=true;setStatus('Getting your current location…');
        navigator.geolocation.getCurrentPosition(position=>{
          setPin(position.coords.latitude,position.coords.longitude);
          setStatus('Current location selected. Drag the pin to the exact store entrance if needed.');
          currentButton.disabled=false;
        },error=>{
          setStatus(error.code===1?'Location permission was denied. Search the address or tap the map to place the pin.':'Could not get your location. Search the address or tap the map to place the pin.');
          currentButton.disabled=false;
        },{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
      });
      if(!hasPin)setStatus('Search your address, use your current location, or tap the map to drop the store pin.');
      requestAnimationFrame(()=>{if(!disposed)map?.invalidateSize();});
    }).catch(error=>{
      if(!disposed)setStatus((error.message||'Map could not be loaded.')+' You can retry by refreshing this page.');
    });
    return cleanup;
  }

  window.WaterNowStoreMapPicker=Object.freeze({mount});
})();