import { app } from './app';
import { seedDatabase } from './seed';
import { expireHeldSlots } from './services/bookingService';
import { processDueMedicationReminders } from './services/reminderService';
import { retryFailedNotifications } from './services/notificationService';

const PORT = process.env.PORT || 4000;

async function startServer() {
  await seedDatabase();

  // Background cron intervals (1 min poll)
  setInterval(async () => {
    try {
      await expireHeldSlots();
      await processDueMedicationReminders();
      await retryFailedNotifications();
    } catch (err) {
      console.error('[CRON WORKER ERROR]:', err);
    }
  }, 60 * 1000);

  app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer();
