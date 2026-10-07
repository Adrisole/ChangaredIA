import fs from 'fs';
import path from 'path';
import { isDbConnected } from '../config/database.js';
import { BusinessModel } from '../models/business.model.js';
import { UserModel } from '../models/user.model.js';
import { SessionModel } from '../models/session.model.js';
import { AppointmentModel } from '../models/appointment.model.js';

export async function migrateJsonToMongo() {
  if (!isDbConnected()) {
    return { migrated: false, reason: 'MongoDB no conectado' };
  }

  console.log('🔄 [Migration] Iniciando sincronización de datos locales (JSON) a MongoDB...');
  let businessCount = 0;
  let userCount = 0;
  let sessionCount = 0;
  let appointmentCount = 0;

  try {
    // 1. Migrar Negocios
    const businessesPath = path.resolve('./src/data/businesses.json');
    if (fs.existsSync(businessesPath)) {
      const raw = fs.readFileSync(businessesPath, 'utf-8');
      const businesses = JSON.parse(raw || '{}');
      for (const [id, data] of Object.entries(businesses)) {
        await BusinessModel.findOneAndUpdate(
          { id: String(id).toLowerCase().trim() },
          { $setOnInsert: { ...data, id: String(id).toLowerCase().trim() } },
          { upsert: true, returnDocument: 'after', timestamps: false }
        );
        businessCount++;
      }
    }

    // 2. Migrar Usuarios
    const usersPath = path.resolve('./src/data/users.json');
    if (fs.existsSync(usersPath)) {
      const raw = fs.readFileSync(usersPath, 'utf-8');
      const users = JSON.parse(raw || '{}');
      for (const [id, data] of Object.entries(users)) {
        await UserModel.findOneAndUpdate(
          { id },
          { $setOnInsert: data },
          { upsert: true, returnDocument: 'after', timestamps: false }
        );
        userCount++;
      }
    }

    // 3. Migrar Sesiones
    const sessionsPath = path.resolve('./src/data/sessions.json');
    if (fs.existsSync(sessionsPath)) {
      const raw = fs.readFileSync(sessionsPath, 'utf-8');
      const sessions = JSON.parse(raw || '{}');
      for (const [token, data] of Object.entries(sessions)) {
        await SessionModel.findOneAndUpdate(
          { token },
          { $setOnInsert: { ...data, token } },
          { upsert: true, returnDocument: 'after', timestamps: false }
        );
        sessionCount++;
      }
    }

    // 4. Migrar Turnos y Citas
    const appointmentsPath = path.resolve('./src/data/appointments.json');
    if (fs.existsSync(appointmentsPath)) {
      const raw = fs.readFileSync(appointmentsPath, 'utf-8');
      const appointments = JSON.parse(raw || '[]');
      if (Array.isArray(appointments)) {
        for (const apt of appointments) {
          await AppointmentModel.findOneAndUpdate(
            { id: apt.id },
            { $setOnInsert: apt },
            { upsert: true, returnDocument: 'after', timestamps: false }
          );
          appointmentCount++;
        }
      }
    }

    console.log(`✅ [Migration] Sincronización exitosa en MongoDB:`);
    console.log(`   🏢 Negocios: ${businessCount}`);
    console.log(`   👤 Usuarios: ${userCount}`);
    console.log(`   🔑 Sesiones: ${sessionCount}`);
    console.log(`   📅 Turnos/Citas: ${appointmentCount}`);

    return {
      migrated: true,
      stats: { businessCount, userCount, sessionCount, appointmentCount }
    };
  } catch (err) {
    console.error('❌ [Migration] Error durante la migración JSON -> MongoDB:', err.message);
    return { migrated: false, error: err.message };
  }
}
