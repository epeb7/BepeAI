export const TypingIndicator = () => (
  <div className="animate-slide-up" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '8px' }}>
    {/* Avatar */}
    <div style={{ flexShrink: 0, marginRight: '10px', marginTop: '2px' }}>
      <div style={{
        width: '26px', height: '26px', borderRadius: '8px',
        background: 'linear-gradient(135deg, hsl(250 85% 46%), hsl(215 85% 50%))',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 2px 8px hsl(250 85% 50% / 0.25)',
      }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.5" fill="white" opacity="0.9" />
          <circle cx="8" cy="8" r="5.5" stroke="white" strokeWidth="0.8" opacity="0.35" />
        </svg>
      </div>
    </div>

    {/* Dots */}
    <div style={{
      padding: '12px 16px', borderRadius: '16px', borderTopLeftRadius: '4px',
      background: 'hsl(220 16% 15%)', border: '1px solid hsl(220 14% 21%)',
      display: 'flex', alignItems: 'center', gap: '5px',
    }}>
      {[0, 160, 320].map(delay => (
        <span
          key={delay}
          className="animate-dot-pulse"
          style={{
            display: 'inline-block', width: '6px', height: '6px',
            borderRadius: '50%', animationDelay: `${delay}ms`,
            background: 'hsl(250 60% 58%)',
          }}
        />
      ))}
    </div>
  </div>
);
