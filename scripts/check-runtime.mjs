import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
const result=await build({entryPoints:['shared/app.js'],bundle:true,write:false,metafile:true,format:'esm',platform:'browser',target:'es2022',logLevel:'silent'});
const problems=[];
for(const file of Object.keys(result.metafile.inputs)){
 if(file.startsWith('node_modules/'))continue;
 if(/^(tests|supabase|artifacts)\//.test(file))problems.push(`${file}: conteúdo de teste/migração importado pela aplicação`);
 const source=await readFile(file,'utf8');
 if(/\b(?:localStorage|indexedDB)\b/.test(source))problems.push(`${file}: persistência local de dados no runtime`);
 if(/demo-user|supplier-demo|cotacao-exemplo|partner-example|createDemoRepository|catalogSeeds|productSeeds/.test(source))problems.push(`${file}: dados ou adaptador de demonstração no runtime`);
}
if(problems.length)throw Error(problems.join('\n'));
console.log(`Runtime validado: ${Object.keys(result.metafile.inputs).filter(file=>!file.startsWith('node_modules/')).length} módulos da aplicação, sem dados de teste ou persistência local de registros.`);
