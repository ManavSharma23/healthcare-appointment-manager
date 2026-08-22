import { EventEmitter } from 'events';
import { processNotificationEvent } from '../services/notificationService';

export const appEventEmitter = new EventEmitter();

// Event Listeners
appEventEmitter.on('appointment.confirmed', async (data) => {
  try {
    await processNotificationEvent('appointment.confirmed', data);
  } catch (err) {
    console.error('[EVENT HANDLER ERROR appointment.confirmed]:', err);
  }
});

appEventEmitter.on('appointment.cancelled', async (data) => {
  try {
    await processNotificationEvent('appointment.cancelled', data);
  } catch (err) {
    console.error('[EVENT HANDLER ERROR appointment.cancelled]:', err);
  }
});

appEventEmitter.on('visit.completed', async (data) => {
  try {
    await processNotificationEvent('visit.completed', data);
  } catch (err) {
    console.error('[EVENT HANDLER ERROR visit.completed]:', err);
  }
});

appEventEmitter.on('leave.conflict', async (data) => {
  try {
    await processNotificationEvent('leave.conflict', data);
  } catch (err) {
    console.error('[EVENT HANDLER ERROR leave.conflict]:', err);
  }
});
