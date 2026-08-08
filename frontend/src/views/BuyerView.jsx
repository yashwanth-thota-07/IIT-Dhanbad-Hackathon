import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

function formatDate(iso) {
  return new Date(iso).toLocaleString();
}

const stripDecimal = (raw) => {
  const value = String(raw).replace(/[^0-9.]/g, '');
  const [int, ...rest] = value.split('.');
  return rest.length ? int + '.' + rest.join('') : int;
};

export default function BuyerView() {
  const { token } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('post');

  const [items, setItems] = useState([{ name: '', quantity: '', companyPricePerKg: '', qualityGrade: 'B' }]);
  const [posting, setPosting] = useState(false);

  const [myRequests, setMyRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const loadMyRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const res = await api('/api/requests/my', { token });
      setMyRequests(res.requests || []);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoadingRequests(false);
    }
  }, [token, toast]);

  useEffect(() => {
    if (tab === 'requests') loadMyRequests();
  }, [tab, loadMyRequests]);

  const handlePost = async (e) => {
    e.preventDefault();
    setPosting(true);
    try {
      // Filter out empty rows
      const validItems = items.filter(i => i.name.trim() !== '' && i.quantity.trim() !== '' && i.companyPricePerKg.trim() !== '');
      if (validItems.length === 0) {
        toast("Please add at least one item with name, quantity and company price", "error");
        setPosting(false);
        return;
      }
      
      const res = await api('/api/requests', { 
        method: 'POST', 
        token, 
        body: { items: validItems.map(i => ({ name: i.name, quantity: Number(i.quantity), companyPricePerKg: Number(i.companyPricePerKg), qualityGrade: i.qualityGrade })) } 
      });
      
      toast(res.message || 'Produce requirement list posted successfully');
      setItems([{ name: '', quantity: '', companyPricePerKg: '', qualityGrade: 'B' }]);
      if (tab === 'requests') loadMyRequests();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setPosting(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    setItems(newItems);
  };

  const addItemRow = () => {
    setItems([...items, { name: '', quantity: '', companyPricePerKg: '', qualityGrade: 'B' }]);
  };

  const removeItemRow = (index) => {
    if (items.length > 1) {
      const newItems = items.filter((_, i) => i !== index);
      setItems(newItems);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this request list?')) return;
    try {
      await api(`/api/requests/${id}`, { method: 'DELETE', token });
      toast('Request list deleted');
      loadMyRequests();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  return (
    <div className="view">
      <div className="tabs">
        <button className={`tab ${tab === 'post' ? 'active' : ''}`} onClick={() => setTab('post')}>Post Requirements</button>
        <button className={`tab ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>My Lists</button>
      </div>

      {tab === 'post' && (
        <form onSubmit={handlePost} className="form panel form-col">
          <h2>Create Produce Requirement List</h2>
          <p className="muted">Add vegetables or fruits and the quantity needed.</p>
          
          <div className="item-rows">
            {items.map((item, index) => (
              <div key={index} className="item-row">
                <input 
                  placeholder="Vegetable Name" 
                  value={item.name}
                  onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                  required
                />
                <input 
                  placeholder="Qty in kg" 
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  required
                />
                <input 
                  placeholder="Company Price ₹/kg" 
                  type="text" 
                  inputMode="decimal"
                  autoComplete="off"
                  value={item.companyPricePerKg}
                  onChange={(e) => handleItemChange(index, 'companyPricePerKg', stripDecimal(e.target.value))}
                  required
                />
                <select
                  value={item.qualityGrade}
                  onChange={(e) => handleItemChange(index, 'qualityGrade', e.target.value)}
                >
                  <option value="A">Grade A</option>
                  <option value="B">Grade B</option>
                  <option value="C">Grade C</option>
                </select>
                {items.length > 1 && (
                  <button type="button" className="btn btn-danger" onClick={() => removeItemRow(index)}>X</button>
                )}
              </div>
            ))}
          </div>
          
          <button type="button" className="btn btn-ghost" onClick={addItemRow}>+ Add another item</button>

          <button className="btn btn-primary" disabled={posting} style={{ marginTop: '1rem' }}>
            {posting ? 'Posting…' : 'Submit List'}
          </button>
        </form>
      )}

      {tab === 'requests' && (
        <div>
          {loadingRequests ? <p className="muted">Loading…</p> : myRequests.length === 0 ? (
            <p className="muted">You have not posted any lists yet.</p>
          ) : (
            <div className="grid">
              {myRequests.map((req) => (
                <div key={req.id} className="card">
                  <div className="card-body">
                    <div className="card-title-row">
                      <h3 className="card-title">List {req.id.slice(-4)}</h3>
                      <span className={`badge ${req.status === 'PENDING_OPERATOR_REVIEW' ? 'badge-paper' : req.status === 'OPEN_FOR_MIDDLEMEN' ? 'badge-electronic' : req.status === 'ACCEPTED' ? 'badge-metal' : req.status === 'COMPLETED' ? 'badge-plastic' : 'badge-rejected'}`}>
                        {req.status}
                      </span>
                    </div>
                    <div className="card-meta">
                      <span>{formatDate(req.createdAt)}</span>
                    </div>
                    <ul style={{ paddingLeft: '20px', marginTop: '10px', marginBottom: '10px' }}>
                      {req.items.map((i, idx) => (
                        <li key={idx}><strong>{i.name}</strong> - {i.quantity} kg @ ₹{i.companyPricePerKg}/kg (Grade {i.qualityGrade || 'B'})</li>
                      ))}
                    </ul>
                    {req.status === 'ACCEPTED' && req.middleman && (
                      <div className="card-meta">
                        <span className="card-seller">Accepted by: {req.middleman.name}</span>
                      </div>
                    )}
                    <div className="card-actions" style={{ marginTop: '1rem' }}>
                      <button className="btn btn-danger" onClick={() => handleDelete(req.id)}>Delete List</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
