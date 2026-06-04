-- ============================================================
-- MINI BILLETERA VIRTUAL SEGURA — schema.sql
-- Ejecutar este archivo para crear la base de datos
-- ============================================================

CREATE DATABASE IF NOT EXISTS billetera_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE billetera_db;

-- Crear usuario de base de datos (no usar root en producción)
-- CREATE USER 'billetera_user'@'localhost' IDENTIFIED BY 'TU_PASSWORD_SEGURA';
-- GRANT SELECT, INSERT, UPDATE ON billetera_db.* TO 'billetera_user'@'localhost';
-- FLUSH PRIVILEGES;

-- ──────────────────────────────────────────
-- TABLA: usuarios
-- password_hash VARCHAR(60) porque BCrypt siempre genera 60 chars
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email        VARCHAR(255) NOT NULL UNIQUE,
  username     VARCHAR(30)  NOT NULL UNIQUE,
  password_hash VARCHAR(60) NOT NULL,               -- BCrypt hash, siempre 60 chars
  saldo        DECIMAL(12,2) NOT NULL DEFAULT 1000.00,
  role         ENUM('usuario','admin') NOT NULL DEFAULT 'usuario',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────
-- TABLA: transferencias (INMUTABLE — solo INSERT)
-- No hay UPDATE ni DELETE sobre esta tabla.
-- ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transferencias (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  emisor_id    INT UNSIGNED NOT NULL,
  receptor_id  INT UNSIGNED NOT NULL,
  monto        DECIMAL(12,2) NOT NULL CHECK (monto > 0),
  fecha        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (emisor_id)   REFERENCES usuarios(id),
  FOREIGN KEY (receptor_id) REFERENCES usuarios(id)
);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_transferencias_emisor   ON transferencias(emisor_id);
CREATE INDEX idx_transferencias_receptor ON transferencias(receptor_id);
CREATE INDEX idx_transferencias_fecha    ON transferencias(fecha);
