export const TypingIndicator = () => {
  return (
    <div className="flex justify-start">
      <div className="bg-white/5 backdrop-blur-sm rounded-2xl px-4 py-2 rounded-bl-none border border-white/10">
        <div className="flex space-x-1">
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
};