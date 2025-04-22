// src/components/PureSVGPreloader.jsx
function PureSVGPreloader() {
    const svgString = `
      <svg width="60" height="60" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Roboto+Mono&amp;display=swap');
            
            @keyframes rotate {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
            
            @keyframes counter-rotate {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(-360deg); }
            }
            
            @keyframes pulse2 {
              0% { transform: scale(0.9); opacity: 0.7; }
              50% { transform: scale(1.1); opacity: 1; }
              100% { transform: scale(0.9); opacity: 0.7; }
            }
            
            .outer-ring {
              transform-origin: 60px 60px;
              animation: counter-rotate 8s linear infinite;
            }
            
            .symbol {
              font-family: 'Roboto Mono', monospace;
              transform-origin: 60px 60px;
              animation: pulse2 2s ease-in-out infinite;
            }
          </style>
          
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#99a1af" stop-opacity="1" />
            <stop offset="100%" stop-color="#99a1af" stop-opacity="1" />
          </linearGradient>
        </defs>
        
        <g class="outer-ring">
          <circle
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke="url(#gradient)"
            stroke-width="2"
            stroke-dasharray="2,7"
            opacity="1"
          />
        </g>
        
        <g class="symbol">
          <text
            x="60"
            y="70"
            font-size="35"
            text-anchor="middle"
            fill="url(#gradient)"
          >
            //
          </text>
        </g>
      </svg>
    `;
  
    return (
      <div className="flex justify-center items-center h-full w-full" 
           dangerouslySetInnerHTML={{ __html: svgString }}>
      </div>
    );
  }
  
  export default PureSVGPreloader;