import * as SQLite from 'expo-sqlite';
import { DB_NAME } from '../db/schema';

export function getISOWeek(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((date.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  );
}

/**
 * ISO week del periodo_desde de la estimacion mas reciente del proyecto.
 * Si no hay estimaciones o no hay periodo_desde → ISO week actual.
 */
export async function getProyectoDisplayWeek(proyectoId: number): Promise<number> {
  try {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    const row = await db.getFirstAsync<{ periodo_desde: string | null }>(
      `SELECT periodo_desde FROM estimacion
       WHERE proyecto_id = ? AND periodo_desde IS NOT NULL AND periodo_desde != ''
       ORDER BY numero DESC LIMIT 1`,
      [proyectoId],
    );
    if (row && row.periodo_desde) {
      const d = new Date(row.periodo_desde);
      if (!isNaN(d.getTime())) return getISOWeek(d);
    }
  } catch {
    // fallback abajo
  }
  return getISOWeek(new Date());
}
