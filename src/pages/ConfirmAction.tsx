import React from 'react';
import './ConfirmAction.css';

interface ConfirmActionProps {
  title: string;
  message: string;
  itemName: string;
  actionLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  breadcrumbs: Array<{ label: string; onClick?: () => void }>;
}

const ConfirmAction: React.FC<ConfirmActionProps> = ({
  title,
  message,
  itemName,
  actionLabel,
  onConfirm,
  onCancel,
  breadcrumbs,
}) => {
  return (
    <div className="confirm-action-page">
      <nav className="breadcrumbs">
        {breadcrumbs.map((crumb, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className="breadcrumb-separator"> / </span>}
            {crumb.onClick ? (
              <button
                className="breadcrumb-link"
                onClick={crumb.onClick}
                type="button"
              >
                {crumb.label}
              </button>
            ) : (
              <span className="breadcrumb-current">{crumb.label}</span>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="confirm-action-content">
        <h1>{title}</h1>
        <div className="confirm-message">
          <p>{message}</p>
          <p className="item-name">"{itemName}"</p>
        </div>
        <div className="confirm-actions">
          <button
            onClick={onCancel}
            className="button button-secondary"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="button button-danger"
            type="button"
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmAction;
