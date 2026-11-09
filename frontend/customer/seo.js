const WaterNowSeo=(()=>{
  const siteUrl=()=>new URL('/',window.location.href).toString();
  const publicTitle='WaterNow | Drinking Water Delivered Locally';
  const publicDescription='Order 20L drinking water cans or a pack of two 10L cans from trusted local suppliers. WaterNow connects your area with convenient home delivery.';
  const publicImage=()=>new URL('/waternow-logo.svg',window.location.origin).toString();
  const privateViews=new Set(['cart','checkout','orders','profile','messages']);

  const upsert=(selector,attributes)=>{
    let el=document.head.querySelector(selector);
    if(!el){el=document.createElement('meta');document.head.appendChild(el)}
    Object.entries(attributes).forEach(([key,value])=>el.setAttribute(key,value));
    return el;
  };

  const canonical=()=>{
    let el=document.head.querySelector('link[rel="canonical"]');
    if(!el){el=document.createElement('link');el.rel='canonical';document.head.appendChild(el)}
    el.href=siteUrl();
  };

  const setStructuredData=()=>{
    if(document.head.querySelector('#waternow-seo-schema'))return;
    const root=siteUrl(),logo=publicImage();
    const script=document.createElement('script');
    script.id='waternow-seo-schema';
    script.type='application/ld+json';
    script.textContent=JSON.stringify({
      '@context':'https://schema.org',
      '@graph':[
        {'@type':'Organization','@id':root+'#organization',name:'WaterNow',url:root,logo},
        {'@type':'WebSite','@id':root+'#website',name:'WaterNow',url:root,publisher:{'@id':root+'#organization'},inLanguage:'en-IN'},
        {'@type':'WebPage','@id':root+'#webpage',url:root,name:publicTitle,description:publicDescription,isPartOf:{'@id':root+'#website'},about:{'@id':root+'#organization'},inLanguage:'en-IN',primaryImageOfPage:{'@type':'ImageObject',url:logo}}
      ]
    });
    document.head.appendChild(script);
  };

  const setView=(view)=>{
    const isPrivate=privateViews.has(view),title=isPrivate?'WaterNow | '+view.charAt(0).toUpperCase()+view.slice(1):publicTitle;
    const description=isPrivate?'WaterNow customer account and ordering area.':publicDescription;
    document.title=title;
    upsert('meta[name="description"]',{name:'description',content:description});
    upsert('meta[name="robots"]',{name:'robots',content:isPrivate?'noindex,follow':'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'});
    upsert('meta[property="og:title"]',{property:'og:title',content:title});
    upsert('meta[property="og:description"]',{property:'og:description',content:description});
    upsert('meta[property="og:url"]',{property:'og:url',content:siteUrl()});
    upsert('meta[property="og:type"]',{property:'og:type',content:'website'});
    upsert('meta[property="og:site_name"]',{property:'og:site_name',content:'WaterNow'});
    upsert('meta[property="og:image"]',{property:'og:image',content:publicImage()});
    upsert('meta[property="og:image:alt"]',{property:'og:image:alt',content:'WaterNow — drinking water delivered locally.'});
    upsert('meta[property="og:image:type"]',{property:'og:image:type',content:'image/svg+xml'});
    upsert('meta[property="og:locale"]',{property:'og:locale',content:'en_IN'});
    upsert('meta[name="twitter:card"]',{name:'twitter:card',content:'summary_large_image'});
    upsert('meta[name="twitter:title"]',{name:'twitter:title',content:title});
    upsert('meta[name="twitter:description"]',{name:'twitter:description',content:description});
    upsert('meta[name="twitter:image"]',{name:'twitter:image',content:publicImage()});
    canonical();
  };

  const init=()=>{setStructuredData();setView('home')};
  return Object.freeze({init,setView});
})();

window.FreshWaySeo=WaterNowSeo;
window.WaterNowSeo=WaterNowSeo;
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>WaterNowSeo.init(),{once:true});else WaterNowSeo.init();
