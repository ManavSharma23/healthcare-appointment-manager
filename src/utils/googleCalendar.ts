import { google } from 'googleapis';

const clientId = process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4000/auth/google/callback';

export function getOAuth2Client() {
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function generateAuthUrl(): string {
  const oauth2Client = getOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
  });
}

export async function createGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string | null,
  eventData: {
    summary: string;
    description: string;
    startISO: string;
    endISO: string;
    patientEmail?: string;
    doctorEmail?: string;
  }
): Promise<string> {
  if (!clientId || !accessToken) {
    // Return mock calendar event ID if tokens not provided
    console.log(`[GOOGLE CALENDAR API MOCK] Created event "${eventData.summary}" from ${eventData.startISO} to ${eventData.endISO}`);
    return `gcal-mock-evt-${Date.now()}`;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: eventData.summary,
      description: eventData.description,
      start: { dateTime: eventData.startISO },
      end: { dateTime: eventData.endISO },
      attendees: [
        ...(eventData.patientEmail ? [{ email: eventData.patientEmail }] : []),
        ...(eventData.doctorEmail ? [{ email: eventData.doctorEmail }] : []),
      ],
    },
  });

  return res.data.id || `gcal-mock-${Date.now()}`;
}

export async function updateGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string | null,
  googleEventId: string,
  eventData: {
    summary: string;
    description: string;
    startISO: string;
    endISO: string;
  }
): Promise<boolean> {
  if (!clientId || !accessToken || googleEventId.startsWith('gcal-mock')) {
    console.log(`[GOOGLE CALENDAR API MOCK] Updated event ${googleEventId} -> "${eventData.summary}"`);
    return true;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  await calendar.events.patch({
    calendarId: 'primary',
    eventId: googleEventId,
    requestBody: {
      summary: eventData.summary,
      description: eventData.description,
      start: { dateTime: eventData.startISO },
      end: { dateTime: eventData.endISO },
    },
  });

  return true;
}

export async function deleteGoogleCalendarEvent(
  accessToken: string,
  refreshToken: string | null,
  googleEventId: string
): Promise<boolean> {
  if (!clientId || !accessToken || googleEventId.startsWith('gcal-mock')) {
    console.log(`[GOOGLE CALENDAR API MOCK] Deleted event ${googleEventId}`);
    return true;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken || undefined,
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  await calendar.events.delete({
    calendarId: 'primary',
    eventId: googleEventId,
  });

  return true;
}
