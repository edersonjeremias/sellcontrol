export default function ModalConfirmacao({ titulo = 'Atenção', mensagem, onSim, onNao }) {
  return (
    <div className="modal-overlay">
      <div className="modal-card mini">
        <div className="modal-header"><h3>{titulo}</h3></div>
        <div className="modal-body" dangerouslySetInnerHTML={{ __html: mensagem }} />
        <div className="modal-footer">
          <button className="btn-confirm" onClick={onSim}>Sim, Continuar</button>
          <button className="btn-cancel"  onClick={onNao}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}
