// Run in DevTools on the OLD origin/path. Never exports auth tokens or settings.
// Only exports arrays shaped like V1 application records.
(() => {
  const applications = [];
  for (let index=0;index<localStorage.length;index++) {
    const key=localStorage.key(index);
    try {
      const value=JSON.parse(localStorage.getItem(key));
      if(Array.isArray(value)) for(const item of value)
        if(item && item.id && item.form && (item.scores || item.support)) applications.push(item);
    } catch {}
  }
  const blob=new Blob([JSON.stringify({applications},null,2)],{type:'application/json'});
  const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='v1-browser-applications.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(link.href),1000);
})();
