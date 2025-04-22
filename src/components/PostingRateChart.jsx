// src/components/PostingRateChart.jsx
import { useEffect, useRef } from 'react';

function PostingRateChart({ timestamps, periodHours = 8, maxBars = 24 }) {
  const canvasRef = useRef(null);
  const outlierThreshold = 50; 

  // Process timestamps into periods and count messages per period
  const processTimestamps = () => {
    if (!timestamps || timestamps.length < 2) return [];
    
    // Sort timestamps in ascending order
    const sortedTimestamps = [...timestamps].sort((a, b) => a - b);
    
    // Define the period in milliseconds
    const periodMs = periodHours * 60 * 60 * 1000;
    
    // Get the start and end times
    const startTime = sortedTimestamps[0];
    const endTime = sortedTimestamps[sortedTimestamps.length - 1];
    
    // Calculate number of periods to cover the time range
    const periods = Math.ceil((endTime - startTime) / periodMs);
    const periodsCount = Math.min(periods, maxBars);
    
    // Initialize period buckets
    const buckets = new Array(periodsCount).fill(0);
    
    // Count messages in each period
    sortedTimestamps.forEach(timestamp => {
      const periodIndex = Math.min(
        Math.floor((timestamp - startTime) / periodMs),
        periodsCount - 1
      );
      if (periodIndex >= 0 && periodIndex < buckets.length) {
        buckets[periodIndex]++;
      }
    });
    
    // Calculate messages per hour in each period
    const messagesPerPeriod = buckets.map(count => {
      // For the first and last periods, we might have partial periods
      return count;
    });
    
    return messagesPerPeriod;
  };

  // Draw the chart
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const messagesPerPeriod = processTimestamps();
    
    if (messagesPerPeriod.length === 0) {
      // Not enough data
      ctx.font = '10px monospace';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'center';
      ctx.fillText('Not enough data', canvas.width / 2, canvas.height / 2);
      return;
    }
    
    // Calculate statistics with outlier handling
    const maxCount = Math.max(...messagesPerPeriod, 1); // Avoid division by zero
    const normalizedMaxCount = outlierThreshold ? 
        Math.min(maxCount, outlierThreshold) : maxCount;
    
    const barWidth = canvas.width / messagesPerPeriod.length;
    
    // Draw bars
    ctx.fillStyle = '#0891b2'; // Light cyan/teal color
    
    messagesPerPeriod.forEach((count, index) => {
      // Apply normalization for outliers while ensuring minimum height
      const normalizedCount = Math.min(count, outlierThreshold);
      const barHeight = count > 0 
        ? Math.max(4, (normalizedCount / normalizedMaxCount) * (canvas.height - 10))
        : 0;
      
      const x = index * barWidth;
      const y = canvas.height - barHeight;
      
      ctx.fillRect(x, y, barWidth - 1, barHeight);
      
      // Add count label if space allows
      if (barHeight > 15 && barWidth > 20) {
        ctx.fillStyle = '#ffffff';
        ctx.font = '9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(count.toString(), x + barWidth/2, y + 10);
        ctx.fillStyle = '#0891b2'; // Reset fill color for next bar
      }
    });
    
    // Draw axis
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height - 0.5);
    ctx.lineTo(canvas.width, canvas.height - 0.5);
    ctx.stroke();
    
    // Set title attribute for hover with additional info about outliers
    const hasOutliers = Math.max(...messagesPerPeriod) > outlierThreshold;
    const titleText = `Messages per ${periodHours}h period: ${messagesPerPeriod.join(', ')}`;
    canvas.title = hasOutliers 
      ? `${titleText} (large values normalized for display)` 
      : titleText;
    
  }, [timestamps, periodHours, maxBars, outlierThreshold]);

  return (
    <div className="relative">
      <canvas 
        ref={canvasRef} 
        width={200}
        height={60} 
        className="w-full h-auto cursor-help"
      />
    </div>
  );
}

export default PostingRateChart;