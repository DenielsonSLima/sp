// Explicit legacy fixtures for tests. Never imported by the application.
export const isRemoteMode=()=>false;
export const getDataContext=()=>null;
export const clearOnContextChange=()=>()=>{};
export const replaceRows=(target,rows)=>{target.splice(0,target.length,...rows);return target;};
export const listRecords=()=>Promise.reject(Error('Use an injected test adapter.'));
export const saveRecord=listRecords;
export const deleteRecord=listRecords;
