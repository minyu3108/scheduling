import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer, EventPropGetter } from 'react-big-calendar';
import moment from 'moment';
import io from 'socket.io-client';
import { SchedulerEvent } from './types';
import './App.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';

// Setup the localizer by providing the moment Object
const localizer = momentLocalizer(moment);

// Connect to the backend server
const socket = io();

const App: React.FC = () => {
  const [events, setEvents] = useState<SchedulerEvent[]>([]);
  const [showAddModal, setShowAddModal] = useState(false); // For adding new events
  const [showEditModal, setShowEditModal] = useState(false); // For editing/deleting existing events
  const [selectedSlot, setSelectedSlot] = useState<{ start: Date; end: Date } | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<SchedulerEvent | null>(null); // The event being edited/deleted
  const [eventTitle, setEventTitle] = useState('');
  const [isTentative, setIsTentative] = useState(false);
  const [editStartTime, setEditStartTime] = useState<string>('');
  const [editEndTime, setEditEndTime] = useState<string>('');

  useEffect(() => {
    // Listen for the initial list of events from the server
    socket.on('initial_events', (initialEvents: SchedulerEvent[]) => {
      // Parse date strings back into Date objects
      const parsedEvents = initialEvents.map(event => ({
        ...event,
        start: new Date(event.start),
        end: new Date(event.end),
      }));
      setEvents(parsedEvents);
    });

    // Listen for new events broadcasted by the server
    socket.on('new_event', (newEvent: SchedulerEvent) => {
      const parsedEvent = {
        ...newEvent,
        start: new Date(newEvent.start),
        end: new Date(newEvent.end),
      };
      setEvents(prevEvents => [...prevEvents, parsedEvent]);
    });

    // Listen for updated events list after a deletion or update
    socket.on('events_updated', (updatedEvents: SchedulerEvent[]) => {
      const parsedEvents = updatedEvents.map(event => ({
        ...event,
        start: new Date(event.start),
        end: new Date(event.end),
      }));
      setEvents(parsedEvents);
    });

    // Clean up the socket connection when the component unmounts
    return () => {
      socket.off('initial_events');
      socket.off('new_event');
      socket.off('events_updated');
    };
  }, []);

  const handleSelectSlot = useCallback(({ start, end }: { start: Date; end: Date }) => {
    setSelectedSlot({ start, end });
    setShowAddModal(true);
    // Reset for new event
    setEventTitle('');
    setIsTentative(false);
  }, []);

  const handleSelectEvent = useCallback((event: SchedulerEvent) => {
    setSelectedEvent(event);
    setEventTitle(event.title); // Pre-fill for editing
    setIsTentative(event.isTentative || false); // Pre-fill for editing
    setEditStartTime(moment(event.start).format('YYYY-MM-DDTHH:mm')); // Format for datetime-local input
    setEditEndTime(moment(event.end).format('YYYY-MM-DDTHH:mm')); // Format for datetime-local input
    setShowEditModal(true);
  }, []);

  const handleAddEvent = () => {
    if (eventTitle && selectedSlot) {
      const newEvent: SchedulerEvent = {
        id: Date.now().toString(), // Generate a simple unique ID
        ...selectedSlot,
        title: eventTitle,
        isTentative: isTentative,
      };
      // Emit the new event to the server
      socket.emit('add_event', newEvent);
      
      // Reset and close modal
      setShowAddModal(false);
      setEventTitle('');
      setIsTentative(false);
      setSelectedSlot(null);
    }
  };

  const handleUpdateEvent = () => {
    if (selectedEvent && eventTitle && editStartTime && editEndTime) {
      const updatedEvent: SchedulerEvent = {
        ...selectedEvent,
        title: eventTitle,
        isTentative: isTentative,
        start: new Date(editStartTime), // Use updated start time
        end: new Date(editEndTime),     // Use updated end time
      };
      socket.emit('update_event', updatedEvent);
      setShowEditModal(false);
      setEventTitle('');
      setIsTentative(false);
      setSelectedEvent(null);
      setEditStartTime('');
      setEditEndTime('');
    }
  };

  const handleDeleteEvent = useCallback(() => {
    if (selectedEvent && window.confirm('Are you sure you want to delete this event?')) {
      socket.emit('delete_event', selectedEvent.id);
      setShowEditModal(false);
      setEventTitle('');
      setIsTentative(false);
      setSelectedEvent(null);
      setEditStartTime('');
      setEditEndTime('');
    }
  }, [selectedEvent]);

  const eventPropGetter: EventPropGetter<SchedulerEvent> = useCallback(
    (event) => ({
      ...(event.isTentative && { className: 'rbc-event-tentative' }),
    }),
    []
  );

  return (
    <div className="App">
      <h1>Collaborative Scheduler</h1>
      <p>Click or drag on the calendar to add an available time slot.</p>
      <p>Click on an existing event to edit or delete it.</p>
      
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '75vh' }}
        selectable
        onSelectSlot={handleSelectSlot}
        onSelectEvent={handleSelectEvent} // Add this for editing/deleting
        eventPropGetter={eventPropGetter}
        defaultView="week"
      />

      {/* Add New Event Modal */}
      {showAddModal && (
        <div className="modal show" style={{ display: 'block' }} tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add Availability</h5>
                <button type="button" className="btn-close" onClick={() => setShowAddModal(false)}></button>
              </div>
              <div className="modal-body">
                <p><strong>From:</strong> {moment(selectedSlot?.start).format('MMMM Do YYYY, h:mm a')}</p>
                <p><strong>To:</strong> {moment(selectedSlot?.end).format('h:mm a')}</p>
                <div className="mb-3">
                  <label htmlFor="eventTitle" className="form-label">Your Name / Title</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    id="eventTitle" 
                    value={eventTitle} 
                    onChange={(e) => setEventTitle(e.target.value)} 
                    placeholder="Enter your name"
                  />
                </div>
                <div className="form-check">
                  <input 
                    className="form-check-input" 
                    type="checkbox" 
                    checked={isTentative} 
                    onChange={(e) => setIsTentative(e.target.checked)} 
                    id="isTentative"
                  />
                  <label className="form-check-label" htmlFor="isTentative">
                    This time is tentative
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowAddModal(false)}>Close</button>
                <button type="button" className="btn btn-primary" onClick={handleAddEvent}>Add Time</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Delete Event Modal */}
      {showEditModal && selectedEvent && (
        <div className="modal show" style={{ display: 'block' }} tabIndex={-1}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Edit/Delete Availability</h5>
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label htmlFor="editStartTime" className="form-label">Start Time</label>
                  <input 
                    type="datetime-local" 
                    className="form-control" 
                    id="editStartTime" 
                    value={editStartTime} 
                    onChange={(e) => setEditStartTime(e.target.value)} 
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="editEndTime" className="form-label">End Time</label>
                  <input 
                    type="datetime-local" 
                    className="form-control" 
                    id="editEndTime" 
                    value={editEndTime} 
                    onChange={(e) => setEditEndTime(e.target.value)} 
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="editEventTitle" className="form-label">Your Name / Title</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    id="editEventTitle" 
                    value={eventTitle} 
                    onChange={(e) => setEventTitle(e.target.value)} 
                  />
                </div>
                <div className="form-check">
                  <input 
                    className="form-check-input" 
                    type="checkbox" 
                    checked={isTentative} 
                    onChange={(e) => setIsTentative(e.target.checked)} 
                    id="editIsTentative"
                  />
                  <label className="form-check-label" htmlFor="editIsTentative">
                    This time is tentative
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Close</button>
                <button type="button" className="btn btn-primary" onClick={handleUpdateEvent}>Update Time</button>
                <button type="button" className="btn btn-danger" onClick={handleDeleteEvent}>Delete Time</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
