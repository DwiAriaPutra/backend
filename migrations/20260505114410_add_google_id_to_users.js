/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('users', (table) => {
    table.string('email').unique();
    table.string('google_id').unique();
    table.string('password').nullable().alter();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('users', (table) => {
    table.string('password').notNullable().alter();
    table.dropColumn('google_id');
    table.dropColumn('email');
  });
};
