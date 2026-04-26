#!/usr/bin/env node

/**
 * Import FFJudo members from CSV into Supabase
 * Usage: node scripts/import-ffjudo-members.mjs [--env dev|prod]
 */

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';

const env = process.argv[2]?.replace('--env', '').trim() || 'prod';
const configFile = path.join(process.cwd(), `supabase/config.${env}.toml`);

if (!fs.existsSync(configFile)) {
  console.error(`❌ Config file not found: ${configFile}`);
  process.exit(1);
}

// Parse config file to get project_id
const configContent = fs.readFileSync(configFile, 'utf-8');
const projectIdMatch = configContent.match(/project_id\s*=\s*"([^"]+)"/);
const projectId = projectIdMatch?.[1];

if (!projectId) {
  console.error('❌ Could not find project_id in config file');
  process.exit(1);
}

const supabaseUrl = `https://${projectId}.supabase.co`;
const supabaseKey = process.env.SUPABASE_ADMIN_KEY;

if (!supabaseKey) {
  console.error('❌ SUPABASE_ADMIN_KEY environment variable not set');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Read and parse CSV
const csvPath = path.join(process.cwd(), 'data/ffjudo-members.csv');
if (!fs.existsSync(csvPath)) {
  console.error(`❌ CSV file not found: ${csvPath}`);
  process.exit(1);
}

const csvContent = fs.readFileSync(csvPath, 'utf-8');
const records = parse(csvContent, {
  columns: true,
  delimiter: ';',
  skip_empty_lines: true,
  trim: true,
});

console.log(`📥 Importing ${records.length} FFJudo members to ${env} environment...`);

// Transform CSV records to DB format
const members = records.map((row) => ({
  license_id: row.LICENCE,
  license_date: new Date(row['DATE PRISE LICENCE'].split('/').reverse().join('-')),
  discipline: row.DISCIPLINE,
  dojo: row.DOJO,
  last_name: row.NOM,
  first_name: row.PRENOM,
  email: row.EMAIL || null,
  phone: row.PORTABLE || null,
  date_of_birth: row.NAISSANCE ? new Date(row.NAISSANCE.split('/').reverse().join('-')) : null,
  gender: row.SEXE,
  address_line1: row.ADRESSE1,
  address_line2: row.ADRESSE2 || null,
  postal_code: row['CODE POSTAL'],
  city: row.VILLE,
  medical_certificate: row['CERTIFICAT MEDICAL'] || null,
  commercial_authorizations: row['AUTORISATIONS COMMERCIALES'] === 'Oui',
}));

// Insert in batches
const batchSize = 100;
let inserted = 0;
let errors = 0;

for (let i = 0; i < members.length; i += batchSize) {
  const batch = members.slice(i, i + batchSize);
  
  try {
    const { error } = await supabase
      .from('ffjudo_members')
      .upsert(batch, { onConflict: 'license_id' });
    
    if (error) {
      console.error(`❌ Batch ${Math.floor(i / batchSize) + 1} failed:`, error);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`✅ Inserted batch ${Math.floor(i / batchSize) + 1} (${batch.length} records)`);
    }
  } catch (err) {
    console.error(`❌ Error inserting batch:`, err);
    errors += batch.length;
  }
}

console.log(`\n📊 Import complete:`);
console.log(`   ✅ Inserted: ${inserted}`);
console.log(`   ❌ Errors: ${errors}`);
console.log(`   📈 Total: ${inserted + errors}`);

if (errors === 0) {
  console.log(`\n✨ All members imported successfully!`);
  process.exit(0);
} else {
  console.log(`\n⚠️  Some records failed to import.`);
  process.exit(1);
}
