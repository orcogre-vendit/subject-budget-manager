import { createPrisma } from "../src/lib/db";
async function main(){ const p=createPrisma();
 const ins=await p.transaction.findMany({ where:{ direction:"IN" }, orderBy:{ seqNo:"asc" }, select:{ id:true, seqNo:true, date:true, status:true, amount:true, description:true, budgetItem:{select:{name:true}}, budgetSubItem:{select:{name:true}}, projectYear:{ select:{ budgetCash:true, yearNo:true, project:{select:{code:true}} } } } });
 for (const t of ins) console.log(JSON.stringify({ seq:t.seqNo, id:t.id, item:t.budgetItem?.name, sub:t.budgetSubItem?.name ?? null, amount:t.amount, desc:t.description, status:t.status }));
 const out=await p.transaction.groupBy({ by:["budgetItemId"], where:{ direction:"OUT", status:{ not:"취소" } }, _sum:{ amount:true } });
 const items=await p.budgetItem.findMany({ select:{ id:true, name:true } });
 console.log("spent:", JSON.stringify(out.map(o=>({ item: items.find(i=>i.id===o.budgetItemId)?.name, out:o._sum.amount }))));
 console.log("budgetCash:", ins[0]?.projectYear.budgetCash, ins[0]?.projectYear.project.code);
 await p.$disconnect(); }
main();
