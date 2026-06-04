// ============================================================
// test-concurrencia.js — BONUS: 10 transferencias en paralelo
// Ejecutar DESPUÉS de tener al menos 2 usuarios con saldo
// Uso: node test-concurrencia.js <token_emisor> <username_receptor>
// ============================================================

const TOKEN     = process.argv[2] || 'TU_JWT_TOKEN_AQUI';
const RECEPTOR  = process.argv[3] || 'bruno';
const API_URL   = 'http://localhost:3000';
const MONTO     = 50;
const N_REQUESTS = 10;

async function transferir(i) {
  const res = await fetch(`${API_URL}/transferir`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`
    },
    body: JSON.stringify({ destinatario: RECEPTOR, monto: MONTO })
  });
  const data = await res.json();
  console.log(`Transferencia ${i + 1}: ${res.status} — ${data.message || data.error}`);
  return { status: res.status, ok: res.ok };
}

async function main() {
  console.log(`\n🚀 Disparando ${N_REQUESTS} transferencias en paralelo...`);
  console.log(`   Monto por transferencia: ${MONTO} créditos`);
  console.log(`   Máximo esperado descontado: ${N_REQUESTS * MONTO} créditos\n`);

  const start = Date.now();

  // Disparar todas en paralelo
  const promises = Array.from({ length: N_REQUESTS }, (_, i) => transferir(i));
  const results  = await Promise.allSettled(promises);

  const exitosas  = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  const fallidas  = results.filter(r => r.status === 'fulfilled' && !r.value.ok).length;
  const elapsed   = Date.now() - start;

  console.log(`\n✅ Resumen:`);
  console.log(`   Exitosas : ${exitosas}`);
  console.log(`   Fallidas : ${fallidas} (rate limit, saldo insuf. o error)`);
  console.log(`   Tiempo   : ${elapsed}ms`);
  console.log(`\n👉 Verificá el saldo final con GET /saldo`);
  console.log(`   El saldo debe haber bajado exactamente ${exitosas * MONTO} créditos.`);
  console.log(`   Si bajó más, hay un bug de concurrencia. Si bajó menos, hay un bug de lógica.\n`);
}

main().catch(console.error);
