import {readFile} from 'node:fs/promises';
import {transform} from 'esbuild';

export async function readOperationalCss(file){
 const source=await readFile(file,'utf8');
 const imported=[];
 for(const match of source.matchAll(/@import\s+url\(["'](.+?)["']\);/g))imported.push(await readOperationalCss(new URL(match[1],file)));
 const {code}=await transform(imported.length?imported.join('\n'):source,{loader:'css',minifyWhitespace:true});
 return code;
}
