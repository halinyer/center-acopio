import React from 'react';

export type NavAction = {
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
  isPrimary?: boolean;
};

export const DynamicBottomNav = ({ actions }: { actions: NavAction[] }) => {
  return (
    <div className="bottom-nav-bar">
      {actions.map((action, i) => (
        <button 
          key={i} 
          className={`nav-btn ${action.isPrimary ? 'primary' : ''}`} 
          onClick={action.onClick}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  );
};
