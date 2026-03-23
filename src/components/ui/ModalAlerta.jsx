export default function ModalAlerta({ titulo = 'Aviso', mensagem, onFechar }) {
  return (
    <div className="modal-overlay">
      <div className="modal-card mini">
        <div className="modal-header"><h3>{titulo}</h3></div>
        <div className="modal-body" dangerouslySetInnerHTML={{ __html: mensagem }} />
        <div className="modal-footer">
          <button className="btn-confirm" onClick={onFechar}>Entendi</button>
        </div>
      </div>
    </div>
  )
}
