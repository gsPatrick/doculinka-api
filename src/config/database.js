// src/config/database.js

// É crucial carregar o dotenv aqui também, para que o Sequelize-CLI
// e a aplicação possam acessar as variáveis de ambiente ao ler este arquivo.
require('dotenv').config();

module.exports = {
  // Configuração para o ambiente de desenvolvimento
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
  },
  
  // Configuração para o ambiente de testes (se você for adicionar testes)
  test: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: `${process.env.DB_NAME}_test`,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false, // Desliga os logs do SQL durante os testes
  },
  
  // Configuração para o ambiente de produção
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Esta opção pode ser necessária dependendo do seu provedor de DB
      }
    },
    logging: false, // Desliga os logs do SQL em produção por performance
  },
};