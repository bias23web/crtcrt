// src/pages/Home/NewMessageAlert.jsx
import React from 'react';

/**
 * New message notification component
 */
const NewMessageAlert = ({ count, loading, autoRefresh, onRefresh }) => {
  if (count <= 0 || loading || autoRefresh) return null;
  
  return (
    <div
      className="fixed top-2 left-4 bg-gray-800 text-sky-300 px-4 py-2 rounded-md shadow-lg cursor-pointer font-mono z-50 flex items-center"
      onClick={onRefresh}
    >
      <div className="w-2 h-2 rounded-full bg-sky-300 mr-2 animate-pulse"></div>
      [ {count} new {count === 1 ? 'message' : 'messages'} - click to refresh ]
    </div>
  );
};

export default NewMessageAlert;