/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
    .createTable('users', (table) => {
      table.increments('id').primary();
      table.string('nim').unique();
      table.string('nama').notNullable();
      table.string('password').notNullable();
      table.string('gender'); // 'L' or 'P'
      table.string('role').defaultTo('user'); // 'user' or 'admin'
      table.string('jurusan');
      table.timestamps(true, true);
    })
    .createTable('location', (table) => {
      table.increments('id').primary();
      table.string('nama_lokasi').notNullable();
      table.text('alamat').notNullable();
      table.timestamps(true, true);
    })
    .createTable('quotas', (table) => {
      table.increments('id').primary();
      table.integer('location_id').unsigned().references('id').inTable('location').onDelete('CASCADE');
      table.string('gender').notNullable();
      table.integer('total_max').notNullable();
      table.integer('current_filled').defaultTo(0);
      table.integer('current_locked').defaultTo(0);
      table.timestamps(true, true);
    })
    .createTable('temporary_locks', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('location_id').unsigned().references('id').inTable('location').onDelete('CASCADE');
      table.integer('quota_id').unsigned().references('id').inTable('quotas').onDelete('CASCADE');
      table.timestamp('expires_at').notNullable();
      table.timestamps(true, true);
    })
    .createTable('selection', (table) => {
      table.increments('id').primary();
      table.integer('user_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.integer('location_id').unsigned().references('id').inTable('location').onDelete('CASCADE');
      table.integer('quota_id').unsigned().references('id').inTable('quotas').onDelete('CASCADE');
      table.timestamps(true, true);
    })
    .createTable('activities', (table) => {
      table.increments('id').primary();
      table.integer('admin_id').unsigned().references('id').inTable('users').onDelete('CASCADE');
      table.string('activity_type').notNullable();
      table.text('description').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .dropTableIfExists('activities')
    .dropTableIfExists('selection')
    .dropTableIfExists('temporary_locks')
    .dropTableIfExists('quotas')
    .dropTableIfExists('location')
    .dropTableIfExists('users');
};
