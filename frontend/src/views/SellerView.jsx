import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

const fmt = (n) =>
  n === undefined || n === null || Number.isNaN(Number(n))
    ? '—'
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '');

const stripNonDigits = (e) => {
  const el = e.target;
  const clean = el.value.replace(/[^0-9]/g, '');
  if (clean !== el.value) el.value = clean;
};

const DealCard = ({ deal, showForm, procBusy, recordProcurement }) => {
  const totalRequired = deal.items.reduce((sum, i) => sum + (Number(i.requiredQuantityKg) || 0), 0);
  const totalProcured = deal.items.reduce((sum, i) => sum + (Number(i.procuredQuantityKg) || 0), 0);
  const overallPct = totalRequired > 0 ? Math.min(100, Math.round((totalProcured / totalRequired) * 100)) : 0;

  return (
    <div className="card">
      <div className="card-body">
        <div className="card-title-row">
          <h3 className="card-title">Deal for {deal.company ? deal.company.name : 'Unknown Company'}</h3>
          <span className={`badge ${deal.status === 'COMPLETED' ? 'badge-metal' : 'badge-paper'}`}>{deal.status}</span>
        </div>

        <div className="deal-summary">
          <div className="deal-stat">
            <span className="deal-stat-label">Total estimated earnings</span>
            <span className="deal-stat-value">₹{fmt(deal.totalEstimatedEarnings)}</span>
            <span className="deal-stat-meta">Accepted {fmtDate(deal.acceptedAt || deal.createdAt)}</span>
          </div>
          <div className="deal-stat deal-stat-progress">
            <span className="deal-stat-label">Procurement progress</span>
            <div className="progress-track" aria-hidden="true">
              <div className="progress-fill" style={{ width: `${overallPct}%` }} />
            </div>
            <span className="deal-stat-meta">{fmt(totalProcured)} / {fmt(totalRequired)} kg · {overallPct}%</span>
          </div>
        </div>

        <div className="table-wrap">
          <table className="detail-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Grade</th>
                <th>Required (kg)</th>
                <th>Procured (kg)</th>
                <th>Farmer ₹/kg</th>
                <th>Your Fee ₹/kg</th>
                <th>Est. Earning</th>
              </tr>
            </thead>
            <tbody>
              {deal.items.map((i, idx) => {
                const required = Number(i.requiredQuantityKg) || 0;
                const procured = Number(i.procuredQuantityKg) || 0;
                const pct = required > 0 ? Math.min(100, Math.round((procured / required) * 100)) : 0;
                return (
                  <tr key={idx}>
                    <td>{i.vegetable}</td>
                    <td>{i.qualityGrade || 'B'}</td>
                    <td>{fmt(i.requiredQuantityKg)}</td>
                    <td>
                      <span className="deal-proc-cell">
                        {fmt(i.procuredQuantityKg)}
                        <span className="progress-track progress-track-mini" aria-hidden="true">
                          <span className="progress-fill" style={{ width: `${pct}%` }} />
                        </span>
                      </span>
                    </td>
                    <td>{fmt(i.farmerPricePerKg)}</td>
                    <td>{fmt(i.middlemanFeePerKg)}</td>
                    <td className="text-ok">₹{fmt(i.estimatedMiddlemanEarnings)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {showForm && (
          <form onSubmit={(e) => recordProcurement(deal.id, e)} className="deal-form">
            <strong className="deal-form-title">Record Procurement</strong>
            <div className="proc-form-row">
              <label className="field">
                <span>Vegetable</span>
                <select name="vegetable" defaultValue="" required>
                  <option value="">Select…</option>
                  {deal.items.map((i) => (
                    <option key={i.vegetable} value={i.vegetable}>{i.vegetable}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Quantity (kg)</span>
                <input
                  name="quantityKg"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  onInput={stripNonDigits}
                />
              </label>
              <label className="field">
                <span>Agreed Farmer Price (₹/kg)</span>
                <input
                  name="agreedFarmerPricePerKg"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  required
                  onInput={stripNonDigits}
                />
              </label>
            </div>
            <button className="btn btn-primary" disabled={procBusy}>{procBusy ? 'Saving…' : 'Record Procurement'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

export default function SellerView() {
  const { token } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('open');

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);

  const [deals, setDeals] = useState([]);
  const [loadingDeals, setLoadingDeals] = useState(false);
  const [procBusy, setProcBusy] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api('/api/requests/pending', { token });
      setRequests(res.requests || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [token, toast]);

  const loadDeals = useCallback(async () => {
    setLoadingDeals(true);
    try {
      const res = await api('/api/requests/my-deals', { token });
      setDeals(res.deals || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingDeals(false);
    }
  }, [token, toast]);

  useEffect(() => {
    if (tab === 'open') loadRequests();
    else loadDeals();
  }, [tab, loadRequests, loadDeals]);

  const handleApprove = async (reqList) => {
    try {
      const res = await api('/api/requests/accept', {
        method: 'POST',
        token,
        body: { requestId: reqList.id }
      });
      toast(res.message || 'List accepted');
      loadRequests();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const handleReject = async (reqList) => {
    try {
      const res = await api('/api/requests/reject', {
        method: 'POST',
        token,
        body: { requestId: reqList.id }
      });
      toast(res.message || 'List rejected');
      loadRequests();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const recordProcurement = async (dealId, e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const vegetable = (fd.get('vegetable') || '').trim();
    const quantityKg = Number(fd.get('quantityKg'));
    const agreedFarmerPricePerKg = Number(fd.get('agreedFarmerPricePerKg'));
    if (!vegetable || !quantityKg || Number.isNaN(agreedFarmerPricePerKg)) {
      toast('Vegetable, quantity and agreed price are required', 'error');
      return;
    }
    setProcBusy(true);
    try {
      const res = await api(`/api/requests/${dealId}/procurements`, {
        method: 'POST',
        token,
        body: { vegetable, quantityKg, agreedFarmerPricePerKg }
      });
      toast(res.message || 'Procurement recorded');
      e.currentTarget.reset();
      loadDeals();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setProcBusy(false);
    }
  };

  const acceptedDeals = deals.filter((d) => d.status === 'ACCEPTED');
  const completedDeals = deals.filter((d) => d.status === 'COMPLETED');

  return (
    <div className="view">
      <div className="tabs">
        <button className={`tab ${tab === 'open' ? 'active' : ''}`} onClick={() => setTab('open')}>Open Deals</button>
        <button className={`tab ${tab === 'myd' ? 'active' : ''}`} onClick={() => setTab('myd')}>My Deals</button>
      </div>

      {tab === 'open' && (
        <div>
          {loading ? (
            <p className="muted">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="muted">No open deals found. Check back after AgriOS activates an opportunity.</p>
          ) : (
            <div className="grid">
              {requests.map((reqList) => (
                <div key={reqList.id} className="card">
                  <div className="card-body">
                    <div className="card-title-row">
                      <h3 className="card-title">List from {reqList.company ? reqList.company.name : 'Unknown Company'}</h3>
                      <span className="badge badge-electronic">Open</span>
                    </div>
                    <div className="card-meta">
                      <span>{fmtDate(reqList.createdAt)}</span>
                    </div>

                    <ul style={{ paddingLeft: '20px', marginTop: '10px', marginBottom: '10px' }}>
                      {reqList.items.map((i, idx) => (
                        <li key={idx}><strong>{i.name}</strong> - {i.quantity} kg (Grade {i.qualityGrade || 'B'})</li>
                      ))}
                    </ul>

                    <div className="card-actions" style={{ marginTop: '1rem' }}>
                      <button className="btn btn-approve" onClick={() => handleApprove(reqList)}>Accept</button>
                      <button className="btn btn-reject" onClick={() => handleReject(reqList)}>Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'myd' && (
        <div>
          {loadingDeals ? (
            <p className="muted">Loading deals…</p>
          ) : deals.length === 0 ? (
            <p className="muted">You have not accepted any deals yet.</p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Accepted (In Progress)</h3>
              {acceptedDeals.length === 0 ? (
                <p className="muted">No accepted deals in progress.</p>
              ) : (
                <div className="grid">{acceptedDeals.map((d) => <DealCard key={d.id} deal={d} showForm procBusy={procBusy} recordProcurement={recordProcurement} />)}</div>
              )}

              <h3 style={{ marginTop: '28px' }}>Completed</h3>
              {completedDeals.length === 0 ? (
                <p className="muted">No completed deals yet. Completed orders appear here once AgriOS approves them.</p>
              ) : (
                <div className="grid">{completedDeals.map((d) => <DealCard key={d.id} deal={d} showForm={false} procBusy={procBusy} recordProcurement={recordProcurement} />)}</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
