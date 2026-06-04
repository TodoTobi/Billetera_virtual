// ============================================================
// MINI BILLETERA VIRTUAL SEGURA — server.js
// Node.js + Express | Todas las protecciones de seguridad
// ============================================================

require('dotenv').config();
const express      = require('express');
const cors         = require('cors');
const bcrypt       = require('bcrypt');
const jwt          = require('jsonwebtoken');
const mysql        = require('mysql2/promise');
const rateLimit    = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const app = express();
app.use(express.json());

// ──────────────────────────────────────────
// PROTECCIÓN 8: CORS configurado con orígenes explícitos
// ──────────────────────────────────────────
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5500', 'http://127.0.0.1:5500'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ──────────────────────────────────────────
// PROTECCIÓN 9: Variables sensibles desde .env
// ──────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
const SALT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

// ──────────────────────────────────────────
// PROTECCIÓN DB: Pool de conexiones con PreparedStatements
// ──────────────────────────────────────────
const db = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS,
  database: process.env.DB_NAME     || 'billetera_db',
  waitForConnections: true,
  connectionLimit: 10
});

// ──────────────────────────────────────────
// PROTECCIÓN EXTRA: Rate Limiting (BONUS)
// ──────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5,
  message: { error: 'Demasiados intentos de login. Esperá 15 minutos.' }
});

const transferLimiter = rateLimit({
  windowMs: 1000,  // 1 segundo
  max: 1,
  message: { error: 'Máximo 1 transferencia por segundo.' }
});

// ──────────────────────────────────────────
// MIDDLEWARE: Verificar JWT
// ──────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer '))
    return res.status(401).json({ error: 'Token requerido.' });

  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// PROTECCIÓN 5: Middleware para verificar rol admin
function adminMiddleware(req, res, next) {
  if (req.user.role !== 'admin')
    return res.status(403).json({ error: 'Acceso denegado: se requiere rol admin.' });
  next();
}

// ──────────────────────────────────────────
// REGISTRO
// Protección 1: BCrypt | Protección 2: PreparedStatement | Protección 4: Validación
// ──────────────────────────────────────────
app.post('/registro', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Mínimo 8 caracteres'),
  body('username').isLength({ min: 3, max: 30 }).trim().escape()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { email, password, username } = req.body;

  try {
    // PROTECCIÓN 1: Hashear contraseña con BCrypt
    const hashPass = await bcrypt.hash(password, SALT_ROUNDS);
    const role = req.body.role === 'admin' ? 'admin' : 'usuario';

    // PROTECCIÓN 2: PreparedStatement — sin concatenación
    await db.execute(
      'INSERT INTO usuarios (email, username, password_hash, saldo, role) VALUES (?, ?, ?, 1000, ?)',
      [email, username, hashPass, role]
    );

    res.status(201).json({ message: 'Usuario registrado con 1000 créditos iniciales.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY')
      return res.status(409).json({ error: 'El email o username ya existe.' });
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ──────────────────────────────────────────
// LOGIN
// Protección 3: JWT | Rate limiting aplicado
// ──────────────────────────────────────────
app.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;

  try {
    const [rows] = await db.execute(
      'SELECT id, email, username, password_hash, saldo, role FROM usuarios WHERE email = ?',
      [email]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: 'Credenciales inválidas.' });

    const user = rows[0];

    // PROTECCIÓN 1: Verificar con BCrypt
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match)
      return res.status(401).json({ error: 'Credenciales inválidas.' });

    // PROTECCIÓN 3: Generar JWT con id y role
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    );

    res.json({ token, username: user.username, role: user.role, saldo: user.saldo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

// ──────────────────────────────────────────
// VER SALDO PROPIO
// Protección 6: Aislamiento por usuario (query usa ID del token, no del body)
// ──────────────────────────────────────────
app.get('/saldo', authMiddleware, async (req, res) => {
  try {
    // PROTECCIÓN 6: El ID viene del JWT, no de la request — el usuario no puede ver el saldo de otro
    const [rows] = await db.execute(
      'SELECT saldo FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    res.json({ saldo: rows[0].saldo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ──────────────────────────────────────────
// TRANSFERIR
// Protección 2: PreparedStatement | Protección 4: Validación completa
// Protección 7: Transacción atómica BEGIN/COMMIT/ROLLBACK
// ──────────────────────────────────────────
app.post('/transferir', authMiddleware, transferLimiter, [
  body('destinatario').notEmpty().trim().escape(),
  body('monto').isFloat({ gt: 0 }).withMessage('El monto debe ser un número positivo mayor a 0')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { destinatario, monto } = req.body;
  const montoNum = parseFloat(monto);
  const emisorId = req.user.id;

  const conn = await db.getConnection();
  try {
    // PROTECCIÓN 7: Inicio de transacción atómica
    await conn.beginTransaction();

    // Buscar emisor con SELECT FOR UPDATE (bloqueo de fila — evita race conditions)
    const [emisorRows] = await conn.execute(
      'SELECT id, username, saldo FROM usuarios WHERE id = ? FOR UPDATE',
      [emisorId]
    );
    const emisor = emisorRows[0];

    // Buscar destinatario (protección 4: destinatario existente)
    const [destRows] = await conn.execute(
      'SELECT id, username FROM usuarios WHERE username = ? OR email = ?',
      [destinatario, destinatario]
    );
    if (destRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Destinatario no encontrado.' });
    }
    const destino = destRows[0];

    // Regla de negocio: no transferirse a sí mismo
    if (emisor.id === destino.id) {
      await conn.rollback();
      return res.status(400).json({ error: 'No podés transferirte créditos a vos mismo.' });
    }

    // Regla de negocio: saldo suficiente
    if (emisor.saldo < montoNum) {
      await conn.rollback();
      return res.status(400).json({ error: 'Saldo insuficiente.' });
    }

    // Descontar al emisor
    await conn.execute(
      'UPDATE usuarios SET saldo = saldo - ? WHERE id = ?',
      [montoNum, emisorId]
    );

    // Acreditar al receptor
    await conn.execute(
      'UPDATE usuarios SET saldo = saldo + ? WHERE id = ?',
      [montoNum, destino.id]
    );

    // Registrar en historial (inmutable: solo INSERT)
    await conn.execute(
      'INSERT INTO transferencias (emisor_id, receptor_id, monto, fecha) VALUES (?, ?, ?, NOW())',
      [emisorId, destino.id, montoNum]
    );

    // PROTECCIÓN 7: COMMIT — todo salió bien
    await conn.commit();

    res.json({
      message: `Transferencia exitosa: ${montoNum} créditos a ${destino.username}.`
    });
  } catch (err) {
    // PROTECCIÓN 7: ROLLBACK — si algo falló, nada queda aplicado
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Error en la transferencia. Operación revertida.' });
  } finally {
    conn.release();
  }
});

// ──────────────────────────────────────────
// HISTORIAL PROPIO
// Protección 6: Aislamiento — solo ve sus transferencias
// ──────────────────────────────────────────
app.get('/historial', authMiddleware, async (req, res) => {
  try {
    // PROTECCIÓN 6: El WHERE usa el id del JWT — no puede ver historial de otro usuario
    const [rows] = await db.execute(`
      SELECT
        t.id, t.monto, t.fecha,
        CASE WHEN t.emisor_id = ? THEN 'enviada' ELSE 'recibida' END AS tipo,
        CASE WHEN t.emisor_id = ? THEN u2.username ELSE u1.username END AS contraparte
      FROM transferencias t
      JOIN usuarios u1 ON t.emisor_id = u1.id
      JOIN usuarios u2 ON t.receptor_id = u2.id
      WHERE t.emisor_id = ? OR t.receptor_id = ?
      ORDER BY t.fecha DESC
    `, [req.user.id, req.user.id, req.user.id, req.user.id]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ──────────────────────────────────────────
// PANEL ADMIN — Lista de usuarios
// Protección 5: Solo accesible con role=admin
// ──────────────────────────────────────────
app.get('/admin/usuarios', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT id, email, username, saldo, role, created_at FROM usuarios ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ──────────────────────────────────────────
// PANEL ADMIN — Top-up manual
// Protección 5: Solo accesible con role=admin | Protección 4: Validación de monto
// ──────────────────────────────────────────
app.post('/admin/topup', authMiddleware, adminMiddleware, [
  body('usuario_id').isInt({ gt: 0 }),
  body('monto').isFloat({ gt: 0 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ errors: errors.array() });

  const { usuario_id, monto } = req.body;

  try {
    const [result] = await db.execute(
      'UPDATE usuarios SET saldo = saldo + ? WHERE id = ?',
      [parseFloat(monto), parseInt(usuario_id)]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Usuario no encontrado.' });

    res.json({ message: `Top-up de ${monto} créditos aplicado correctamente.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ──────────────────────────────────────────
// PANEL ADMIN — Historial completo del sistema
// ──────────────────────────────────────────
app.get('/admin/historial', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        t.id, t.monto, t.fecha,
        u1.username AS emisor,
        u2.username AS receptor
      FROM transferencias t
      JOIN usuarios u1 ON t.emisor_id = u1.id
      JOIN usuarios u2 ON t.receptor_id = u2.id
      ORDER BY t.fecha DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno.' });
  }
});

// ──────────────────────────────────────────
// INICIO DEL SERVIDOR
// ──────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Billetera API corriendo en http://localhost:${PORT}`);
});
