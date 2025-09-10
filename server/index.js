const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const admin = require('firebase-admin');

let serviceAccount;
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  // For production, the service account key is stored in an environment variable
  serviceAccount = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
} else {
  // For local development, fall back to the JSON file
  serviceAccount = require('./serviceAccountKey.json');
}

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
const eventsCollection = db.collection('events');

const app = express();

// Serve static files from the React build directory
app.use(express.static(path.join(__dirname, '..', 'client', 'build')));
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "https://when-6a4f5.web.app", // Allow connections from your deployed frontend
    methods: ["GET", "POST"]
  }
});

// Helper function to fetch all events from Firestore and broadcast
const broadcastEvents = async () => {
  try {
    console.log('Broadcasting events...');
    const snapshot = await eventsCollection.orderBy('start').get();
    const events = snapshot.docs.map(doc => ({
      id: doc.id, // Firestore document ID as event ID
      ...doc.data(),
      start: doc.data().start.toDate(), // Convert Firestore Timestamp to Date
      end: doc.data().end.toDate(),     // Convert Firestore Timestamp to Date
    }));
    console.log('Events to broadcast:', events);
    io.emit('events_updated', events);
  } catch (error) {
    console.error('Error broadcasting events:', error);
  }
};



io.on('connection', async (socket) => {
  console.log('a user connected');

  // Send the current list of events to the newly connected user
  try {
    const snapshot = await eventsCollection.orderBy('start').get();
    const events = snapshot.docs.map(doc => ({
      id: doc.id, // Firestore document ID as event ID
      ...doc.data(),
      start: doc.data().start.toDate(), // Convert Firestore Timestamp to Date
      end: doc.data().end.toDate(),     // Convert Firestore Timestamp to Date
    }));
    socket.emit('initial_events', events);
  } catch (error) {
    console.error('Error sending initial events:', error);
  }

  // Listen for a new event from a client
  socket.on('add_event', async (newEvent) => {
    try {
      // Firestore will auto-generate an ID, so we don't need newEvent.id here
      const docRef = await eventsCollection.add({
        title: newEvent.title,
        start: new Date(newEvent.start),
        end: new Date(newEvent.end),
        isTentative: newEvent.isTentative || false,
        notes: newEvent.notes || '',
      });
      console.log('New event added with ID:', docRef.id);
      await broadcastEvents();
    } catch (error) {
      console.error('Error adding event:', error);
    }
  });

  // Listen for an event update from a client
  socket.on('update_event', async (updatedEvent) => {
    try {
      const { id, ...data } = updatedEvent;
      await eventsCollection.doc(id).update({
        title: data.title,
        start: new Date(data.start),
        end: new Date(data.end),
        isTentative: data.isTentative || false,
        notes: data.notes || '',
      });
      console.log('Event updated with ID:', id);
      await broadcastEvents();
    } catch (error) {
      console.error('Error updating event:', error);
    }
  });

  // Listen for an event deletion from a client
  socket.on('delete_event', async (eventId) => {
    try {
      await eventsCollection.doc(eventId).delete();
      console.log('Event deleted with ID:', eventId);
      await broadcastEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('user disconnected');
  });

  // Listen for a manual request to delete old events
  socket.on('manual_delete_old_events', async (data) => {
    try {
      const beforeDate = new Date(data.beforeDate);
      console.log(`Manual request to delete events before ${beforeDate.toISOString()}`);

      const oldEventsQuery = eventsCollection.where('end', '<', beforeDate);
      const snapshot = await oldEventsQuery.get();

      if (snapshot.empty) {
        console.log('No old events to delete.');
        return;
      }

      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      await batch.commit();

      console.log(`Manually deleted ${snapshot.size} old events.`);
      await broadcastEvents(); // Update clients

    } catch (error) {
      console.error('Error during manual deletion of old events:', error);
    }
  });
});

// The "catchall" handler: for any request that doesn't match a static file,
// send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'client', 'build', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on *:${PORT}`);
});