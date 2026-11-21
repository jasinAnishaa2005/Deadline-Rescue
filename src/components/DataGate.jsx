import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext.jsx';
import { ErrorPanel, Spinner } from './ui.jsx';

/** Renders children only once task data is loaded; shows honest errors otherwise. */
export default function DataGate({ children }) {
  const { data, loading, error, source, setSource, refresh } = useData();
  if (error) {
    return (
      <ErrorPanel title={source === 'notion' ? 'Could not load your Notion tasks' : 'Could not load tasks'} message={error.message}>
        <button className="btn-primary" onClick={refresh}>
          Try again
        </button>
        {source === 'notion' && (
          <>
            <Link className="btn-ghost" to="/notion">
              Check Notion setup
            </Link>
            <button className="btn-ghost" onClick={() => setSource('local')}>
              Use my own assignments
            </button>
            <button className="btn-ghost" onClick={() => setSource('demo')}>
              Explore with demo data
            </button>
          </>
        )}
      </ErrorPanel>
    );
  }
  if (!data) return <Spinner label={loading && source === 'notion' ? 'Syncing with Notion…' : 'Loading…'} />;
  return children(data);
}
