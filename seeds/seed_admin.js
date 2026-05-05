const bcrypt = require('bcryptjs');

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> } 
 */
exports.seed = async function(knex) {
  // Deletes ALL existing entries for the admin user if exists to avoid duplication
  await knex('users').where({ role: 'admin' }).del();

  const hashedPassword = await bcrypt.hash('00000000', 10);

  await knex('users').insert([
    {
      nama: 'admin',
      nim: 'admin', // Using 'admin' as NIM to avoid unique constraint issues if left null/empty
      password: hashedPassword,
      role: 'admin',
      gender: 'L',
      jurusan: 'Admin System'
    }
  ]);
};
