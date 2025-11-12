// src/config/database.js

require('dotenv').config();
const { Sequelize } = require('sequelize');

// Criação da instância Sequelize usando variáveis do .env
const sequelize = new Sequelize(
  process.env.DB_NAME,        // Nome do banco de dados
  process.env.DB_USER,        // Usuário
  process.env.DB_PASSWORD,    // Senha
  {
    host: process.env.DB_HOST, // Host do banco
    port: process.env.DB_PORT || 5432, // Porta padrão PostgreSQL
    dialect: 'postgres',
    logging: false, // Mude para console.log se quiser ver as queries no console
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false,
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  }
);

// Função para testar a conexão
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('✅ Conexão com o banco de dados estabelecida com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao conectar com o banco de dados:', error.message);
  }
}

testConnection();

module.exports = sequelize;
