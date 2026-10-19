import {cp,mkdir,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist');
for(const entry of ['index.html','assets','login','interno','shared']) await cp(entry,`dist/${entry}`,{recursive:true});
console.log('Static build ready in dist/');
