import 'dotenv/config';
const id=process.argv[2];
if(id&&!/^\d+$/.test(id)) throw new Error('Use a numeric character ID');
const response=await fetch(`http://127.0.0.1:${process.env.API_PORT||3100}/admin/${id?'character?id='+id:'overview'}`,{headers:{'x-admin-key':process.env.ADMIN_KEY||''}});
console.log(JSON.stringify(await response.json(),null,2));
if(!response.ok) process.exitCode=1;
