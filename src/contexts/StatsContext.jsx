// src/contexts/StatsContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';

const StatsContext = createContext(null);

export const StatsProvider = ({ children }) => {
  const [messageTimestamps, setMessageTimestamps] = useState([]);
  const [avgPostingRate, setAvgPostingRate] = useState('N/A');
  
  // Calculate posting rate based on timestamps
  const calculatePostingRate = () => {
    if (messageTimestamps.length < 2) {
      console.log('StatsContext: Not enough timestamps for rate calculation', messageTimestamps);
      setAvgPostingRate('N/A');
      return;
    }
    
    // Sort timestamps in ascending order (from old to new)
    const sortedTimestamps = [...messageTimestamps].sort((a, b) => a - b);
    
    // Calculate total time range in hours
    const timeRangeMs = sortedTimestamps[sortedTimestamps.length - 1] - sortedTimestamps[0];
    const timeRangeHours = timeRangeMs / (1000 * 60 * 60);
    
    // Calculate messages per hour (avoiding division by zero)
    if (timeRangeHours <= 0) {
      setAvgPostingRate('N/A');
      return;
    }
    
    // Messages per hour, minus 1 because we're measuring intervals between messages
    const messagesPerHour = (messageTimestamps.length - 1) / timeRangeHours;
    
    // Format the result
    let formattedRate;
    if (messagesPerHour < 1) {
      // Less than 1 message per hour
      const messagesPerDay = messagesPerHour * 24;
      formattedRate = `${messagesPerDay.toFixed(1)}/day`;
    } else {
      formattedRate = `${messagesPerHour.toFixed(1)}/hour`;
    }
    
    console.log('StatsContext: Calculated average posting rate', formattedRate);
    setAvgPostingRate(formattedRate);
  };
  
  // Update rate when timestamps change
  useEffect(() => {
    console.log('StatsContext: Timestamps updated', messageTimestamps);
    calculatePostingRate();
  }, [messageTimestamps]);
  
  // Context value
  const value = {
    messageTimestamps,
    setMessageTimestamps,
    avgPostingRate
  };
  
  return (
    <StatsContext.Provider value={value}>
      {children}
    </StatsContext.Provider>
  );
};

export const useStats = () => {
  const context = useContext(StatsContext);
  if (!context) {
    throw new Error('useStats must be used within a StatsProvider');
  }
  return context;
};