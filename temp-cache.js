console.log('Clearing all caches...');
caches.keys().then(keys => {
  keys.forEach(key => caches.delete(key));
});
console.log('Cache cleared.');
