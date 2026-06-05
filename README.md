# Mini Billetera Virtual Segura

**Materia:** Procesamiento de la Información — ET N° 20  
**Alumno:** Tobias Vera  
**Stack:** Node.js + Express + MySQL + HTML/CSS/JS

---

## ¿Cómo levantar la app?

### 1. Requisitos previos
- Node.js v18+
- MySQL 8+
- (Opcional) Live Server para el frontend

### 2. Base de datos
```bash
mysql -u root -p < backend/schema.sql
```

### 3. Configurar variables de entorno
```bash
cd backend
cp .env.example .env
# Editá .env y completá DB_PASS y JWT_SECRET
```
Para generar un JWT_SECRET seguro:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 4. Instalar dependencias e iniciar el servidor
```bash
cd backend
npm install
npm start
```

### 5. Abrir el frontend
Abrí `frontend/index.html` con Live Server (VS Code) o cualquier servidor estático en el puerto 5500.

---

## ✅ Checklist de las 10 protecciones implementadas

### 1. Contraseñas hasheadas con BCrypt
**Dónde:** `server.js` línea ~70 (registro) y ~100 (login)  
**Cómo:** Se usa `bcrypt.hash(password, 12)` al registrar y `bcrypt.compare()` al verificar.  
**Prueba:** Mirá la base de datos: la columna `password_hash` muestra `$2b$12$...`, nunca texto plano.

### 2. PreparedStatements / Queries parametrizadas
**Dónde:** Todas las queries en `server.js` usan `db.execute('SELECT ... WHERE x = ?', [valor])`  
**Cómo:** Jamás hay concatenación de strings en SQL. El driver mysql2 separa datos de código.  
**Prueba:** Intentá registrarte con email `x@x.com'; DROP TABLE usuarios; --`. La tabla sigue intacta.

### 3. Autenticación con JWT
**Dónde:** `server.js` función `authMiddleware`  
**Cómo:** Al hacer login, el servidor genera `jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '2h' })`. Cada endpoint protegido verifica el token antes de responder.  
**Prueba:** Intentá acceder a `GET /saldo` sin Authorization header → responde 401.

### 4. Validación de todos los inputs en el servidor
**Dónde:** Middlewares `express-validator` antes de cada endpoint  
**Cómo:** Email con `.isEmail()`, contraseña con `.isLength({ min: 8 })`, monto con `.isFloat({ gt: 0 })`  
**Prueba:** Intentá transferir monto `"hola"` o `-50` → responde 400 con mensaje de error.

### 5. Autorización por rol
**Dónde:** Middleware `adminMiddleware` aplicado a todos los endpoints `/admin/*`  
**Cómo:** Verifica `req.user.role === 'admin'`. Si es usuario común, responde 403.  
**Prueba:** Loguearte como usuario común y hacer `GET /admin/usuarios` → responde 403.

### 6. Aislamiento por usuario
**Dónde:** Endpoints `/saldo` e `/historial`  
**Cómo:** El `WHERE id = ?` usa `req.user.id` extraído del JWT, no un parámetro de la request. El usuario no puede pedir el saldo de otro modificando la URL.  
**Prueba:** El endpoint no acepta ningún parámetro de ID externo — siempre usa el ID del token.

### 7. Transacciones atómicas (BEGIN / COMMIT / ROLLBACK)
**Dónde:** Endpoint `POST /transferir`  
**Cómo:** Se abre una conexión con `db.getConnection()`, se ejecuta `conn.beginTransaction()`, y en caso de cualquier error se llama `conn.rollback()`. Solo si todo sale bien se llama `conn.commit()`.  
**Prueba:** Simulá un error a mitad de la transferencia (p.ej. matando el proceso entre los dos UPDATE) — ningún saldo queda modificado.

### 8. CORS configurado con orígenes explícitos
**Dónde:** Línea ~20 de `server.js`  
**Cómo:** `cors({ origin: ['http://localhost:5500'] })` lista solo los orígenes permitidos.  
**Prueba:** Desde la consola del navegador en un sitio distinto, hacé un fetch a la API → aparece error CORS.

### 9. Variables sensibles en .env
**Dónde:** Archivo `.env` (no incluido en el repo), referenciadas con `process.env.*`  
**Cómo:** JWT_SECRET y DB_PASS nunca aparecen hardcodeadas en el código. `.gitignore` excluye `.env`.  
**Prueba:** Revisá el historial de commits en GitHub — el archivo `.env` no aparece nunca.

### 10. .gitignore correcto + README
**Dónde:** `.gitignore` en la raíz del proyecto  
**Cómo:** Excluye `.env`, `node_modules/`, logs y archivos de sistema.  
**Prueba:** `git status` no muestra `.env` como archivo trackeado.

---

## 📋 Documento de pruebas

### Reglas de negocio

| Escenario | Input | Resultado esperado | ✅ |
|-----------|-------|-------------------|---|
| Transferencia normal | ana → bruno, 200 | Ana baja 200, Bruno sube 200 | ✅ |
| Auto-transferencia | ana → ana, 100 | Error: "No podés transferirte a vos mismo" | ✅ |
| Saldo insuficiente | ana tiene 800, intenta enviar 5000 | Error: "Saldo insuficiente" | ✅ |
| Monto negativo | monto: -100 | Error de validación 400 | ✅ |
| Monto cero | monto: 0 | Error de validación 400 | ✅ |
| Destinatario inexistente | username: "fantasma" | Error 404 | ✅ |

### Ataques de seguridad

| Ataque | Input | Resultado | ✅ |
|--------|-------|-----------|---|
| SQL Injection en login | `' OR '1'='1` como email | Query parametrizada, no ejecuta código | ✅ |
| Acceso sin token | GET /saldo sin header | 401 Unauthorized | ✅ |
| Token modificado | Cambiar role en payload | 401 Invalid Signature | ✅ |
| Usuario accede a panel admin | JWT de role=usuario | 403 Forbidden | ✅ |
| Brute force login | 6+ intentos en 15min | 429 Too Many Requests | ✅ |

---

## 🎬 Guía para el video de demostración

Ver sección "Instrucciones para el video" más abajo.

---

## 🔧 Bonus implementados

- [x] **Rate limiting** en `/login` (5 intentos / 15 min) y `/transferir` (1 req / segundo)
- [x] **SELECT FOR UPDATE** en transferencias para bloqueo de fila (previene race conditions)
- [ ] HTTPS con mkcert (opcional)
- [ ] Test de concurrencia con `test-concurrencia.js`
