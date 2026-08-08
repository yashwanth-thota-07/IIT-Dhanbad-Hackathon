import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

const fmt = (n) =>
  n === undefined || n === null || Number.isNaN(Number(n))
    ? '—'
    : Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString() : '');

const badgeFor = (status) => {
  if (status === 'OPEN_FOR_MIDDLEMEN') return 'badge-electronic';
  if (status === 'ACCEPTED') return 'badge-metal';
  if (status === 'PENDING_OPERATOR_REVIEW') return 'badge-paper';
  return 'badge-plastic';
};

const tableStyle = {
  width: '100%',
  minWidth: '760px',
  borderCollapse: 'collapse',
  fontSize: 'var(--text-base)',
  marginTop: '8px',
};
const thStyle = {
  textAlign: 'left',
  color: 'var(--color-muted)',
  fontWeight: 600,
  borderBottom: '1px solid var(--color-hairline)',
  padding: '12px 16px',
  whiteSpace: 'nowrap',
};
const tdStyle = {
  borderBottom: '1px solid var(--color-hairline)',
  padding: '12px 16px',
  color: 'var(--color-text)',
};

const QueueCard = ({ req, onActivate, onReject, busy }) => (
  <div className="card">
    <div className="card-body">
      <div className="card-title-row">
        <h3 className="card-title">Review: {req.company ? req.company.name : 'Unknown Company'}</h3>
        <span className="badge badge-paper">Pending Review</span>
      </div>
      <div className="card-meta">
        <span>{req.company ? req.company.email : ''}</span>
        <span>Posted {fmtDate(req.createdAt)}</span>
      </div>
      <div className="table-wrap">
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Item</th>
              <th style={thStyle}>Qty (kg)</th>
              <th style={thStyle}>Co. Price</th>
              <th style={thStyle}>Farmer (50%)</th>
              <th style={thStyle}>MM Fee</th>
              <th style={thStyle}>Transport</th>
              <th style={thStyle}>Handling</th>
              <th style={thStyle}>AgriOS</th>
              <th style={thStyle}>Viable</th>
            </tr>
          </thead>
          <tbody>
            {req.items.map((it, idx) => (
              <tr key={idx}>
                <td style={tdStyle}>
                  {it.name} <span className="muted">(G{it.qualityGrade || 'B'})</span>
                </td>
                <td style={tdStyle}>{fmt(it.quantity)}</td>
                <td style={tdStyle}>₹{fmt(it.companyPricePerKg)}</td>
                <td style={tdStyle}>₹{fmt(it.farmerPricePerKg)}</td>
                <td style={tdStyle}>₹{fmt(it.middlemanFeePerKg)}</td>
                <td style={tdStyle}>₹{fmt(it.transportCostPerKg)}</td>
                <td style={tdStyle}>₹{fmt(it.handlingCostPerKg)}</td>
                <td style={tdStyle}>₹{fmt(it.agriosRemainingValuePerKg)}</td>
                <td style={tdStyle}>
                  {it.error ? (
                    <span className="text-bad">{it.error}</span>
                  ) : it.isViable ? (
                    <span className="text-ok">Yes</span>
                  ) : (
                    <span className="text-bad">No</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card-actions">
        <button className="btn btn-approve" disabled={busy} onClick={() => onActivate(req.id)}>Activate Deal</button>
        <button className="btn btn-reject" disabled={busy} onClick={() => onReject(req.id)}>Reject</button>
      </div>
    </div>
  </div>
);

const DetailPanel = ({ request, token }) => {
  const toast = useToast();
  const [detail, setDetail] = useState({ loading: true, procurement: null, transport: null, settlement: null });
  const [status, setStatus] = useState(request.status);

  useEffect(() => {
    setStatus(request.status);
  }, [request.status, request.id]);

  const loadDetail = useCallback(async () => {
    setDetail({ loading: true, procurement: null, transport: null, settlement: null });
    try {
      const [procurement, transport, settlement] = await Promise.all([
        api(`/api/requests/${request.id}/procurement-status`, { token }).catch(() => null),
        api(`/api/requests/${request.id}/transport`, { token }).catch(() => null),
        api(`/api/requests/${request.id}/settlement`, { token }).catch(() => null),
      ]);
      setDetail({ loading: false, procurement, transport, settlement });
    } catch {
      setDetail({ loading: false, procurement: null, transport: null, settlement: null });
    }
  }, [request.id, token]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const updateTransport = async (status) => {
    try {
      await api(`/api/requests/${request.id}/transport/status`, { method: 'PATCH', token, body: { status } });
      toast('Transport status updated');
      loadDetail();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const generateSettlement = async () => {
    try {
      await api(`/api/requests/${request.id}/settlement`, { method: 'POST', token });
      toast('Settlement generated');
      loadDetail();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const approveCompletion = async () => {
    try {
      const res = await api(`/api/requests/${request.id}/complete`, { method: 'POST', token });
      toast(res.message || 'Request marked as completed');
      setStatus('COMPLETED');
      loadDetail();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  const transportStatus = detail.transport?.transport?.status || 'NOT_STARTED';
  const canDispatch = transportStatus === 'READY_FOR_DISPATCH';
  const canDeliver = transportStatus === 'DISPATCHED';

  return (
    <div className="panel">
      <div className="card-title-row">
        <h3 className="card-title">Request {request.id.slice(-6)} — {status}</h3>
        <span className={`badge ${badgeFor(status)}`}>{status}</span>
      </div>

      {status === 'ACCEPTED' && (
        <div className="order-row" style={{ marginTop: '10px' }}>
          <span className="muted">Procurement partner is executing this deal.</span>
          <button className="btn btn-approve" onClick={approveCompletion}>Approve Completion</button>
        </div>
      )}

      {detail.loading ? (
        <p className="muted">Loading detail…</p>
      ) : (
        <>
          {detail.procurement && (
            <>
              <h4 style={{ marginBottom: 0 }}>Procurement Progress</h4>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <th style={thStyle}>Item</th>
                    <th style={thStyle}>Required</th>
                    <th style={thStyle}>Procured</th>
                    <th style={thStyle}>Remaining</th>
                    <th style={thStyle}>Completion</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.procurement.items.map((it, idx) => (
                    <tr key={idx}>
                      <td style={tdStyle}>{it.vegetable}</td>
                      <td style={tdStyle}>{fmt(it.requiredQuantityKg)}</td>
                      <td style={tdStyle}>{fmt(it.procuredQuantityKg)}</td>
                      <td style={tdStyle}>{fmt(it.remainingQuantityKg)}</td>
                      <td style={tdStyle}>{fmt(it.completionPercentage)}%</td>
                      <td style={tdStyle}>{it.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h4 style={{ marginBottom: 0, marginTop: '14px' }}>Transport</h4>
          <div className="order-row" style={{ marginTop: '6px' }}>
            <span>Status: <strong>{transportStatus}</strong></span>
            <div className="card-actions" style={{ marginTop: 0 }}>
              {canDispatch && <button className="btn btn-ghost" onClick={() => updateTransport('DISPATCHED')}>Mark Dispatched</button>}
              {canDeliver && <button className="btn btn-ghost" onClick={() => updateTransport('DELIVERED')}>Mark Delivered</button>}
            </div>
          </div>
          {detail.transport?.transport?.transportCostPerKg !== undefined && (
            <p className="muted" style={{ marginTop: '6px' }}>
              Transport @ ₹{detail.transport.transport.transportCostPerKg}/kg — required ₹
              {fmt(detail.transport.transport.estimatedTransportCostForRequiredQuantity)} / procured ₹
              {fmt(detail.transport.transport.estimatedTransportCostForProcuredQuantity)}
            </p>
          )}

          <h4 style={{ marginBottom: 0, marginTop: '14px' }}>Settlement</h4>
          {detail.settlement ? (
            <div style={{ marginTop: '6px' }}>
              <p className="muted" style={{ margin: 0 }}>
                Status: <strong>{detail.settlement.status}</strong>
                {detail.settlement.reconciliationDifference !== undefined && (
                  <> — Difference ₹{fmt(detail.settlement.reconciliationDifference)}</>
                )}
              </p>
              {detail.settlement.totals && (
                <table style={tableStyle}>
                  <tbody>
                    <tr><td style={tdStyle}>Company Value</td><td style={tdStyle}>₹{fmt(detail.settlement.totals.companyValue)}</td></tr>
                    <tr><td style={tdStyle}>Farmer Payment (actual)</td><td style={tdStyle}>₹{fmt(detail.settlement.totals.farmerPayment)}</td></tr>
                    <tr><td style={tdStyle}>Middleman Earnings</td><td style={tdStyle}>₹{fmt(detail.settlement.totals.middlemanEarnings)}</td></tr>
                    <tr><td style={tdStyle}>Transport</td><td style={tdStyle}>₹{fmt(detail.settlement.totals.transportCost)}</td></tr>
                    <tr><td style={tdStyle}>Handling</td><td style={tdStyle}>₹{fmt(detail.settlement.totals.handlingCost)}</td></tr>
                    <tr><td style={tdStyle}>AgriOS Remaining Value</td><td style={tdStyle}>₹{fmt(detail.settlement.totals.agriosRemainingValue)}</td></tr>
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="order-row" style={{ marginTop: '6px' }}>
              <span className="muted">Not generated yet.</span>
              <button className="btn btn-primary" onClick={generateSettlement}>Generate Settlement</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default function OperatorView() {
  const { token } = useAuth();
  const toast = useToast();

  const [tab, setTab] = useState('queue');
  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [selected, setSelected] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const res = await api('/api/requests/operator/queue', { token });
      setQueue(res.requests || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingQueue(false);
    }
  }, [token, toast]);

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await api('/api/requests/operator', { token });
      setRequests(res.requests || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingRequests(false);
    }
  }, [token, toast]);

  useEffect(() => {
    if (tab === 'queue') loadQueue();
    else loadRequests();
  }, [tab, loadQueue, loadRequests]);

  const handleActivate = async (id) => {
    setBusy(true);
    try {
      await api(`/api/requests/${id}/activate`, { method: 'POST', token });
      toast('Opportunity activated');
      loadQueue();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async (id) => {
    const reason = window.prompt('Reason for rejection (optional):');
    if (reason === null) return;
    setBusy(true);
    try {
      await api(`/api/requests/${id}/operator-reject`, { method: 'POST', token, body: { rejectionReason: reason || undefined } });
      toast('Request rejected');
      loadQueue();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="view">
      <div className="tabs">
        <button className={`tab ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>Review Queue</button>
        <button className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All Requests</button>
      </div>

      {tab === 'queue' && (
        <div className="grid">
          {loadingQueue ? (
            <p className="muted">Loading queue…</p>
          ) : queue.length === 0 ? (
            <p className="muted">No requests pending operator review.</p>
          ) : (
            queue.map((req) => (
              <QueueCard key={req.id} req={req} busy={busy} onActivate={handleActivate} onReject={handleReject} />
            ))
          )}
        </div>
      )}

      {tab === 'all' && (
        <div>
          {loadingRequests ? (
            <p className="muted">Loading requests…</p>
          ) : requests.length === 0 ? (
            <p className="muted">No requests found.</p>
          ) : (
            <div className="order-list">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="panel"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelected(selected && selected.id === req.id ? null : req)}
                >
                  <div className="order-row">
                    <div>
                      <strong>{req.company ? req.company.name : 'Unknown Company'}</strong>
                      <div className="muted" style={{ fontSize: '12px' }}>
                        {req.items.map((i) => `${i.name} (${fmt(i.quantity)}kg @ ₹${fmt(i.companyPricePerKg)})`).join(', ')}
                      </div>
                      <div className="muted" style={{ fontSize: '12px' }}>
                        {req.middleman ? `Middleman: ${req.middleman.name}` : 'No middleman'} · Posted {fmtDate(req.createdAt)}
                      </div>
                    </div>
                    <span className={`badge ${badgeFor(req.status)}`}>{req.status}</span>
                  </div>
                  {selected && selected.id === req.id && (
                    <div style={{ marginTop: '14px' }}>
                      <DetailPanel request={req} token={token} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
