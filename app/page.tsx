import Link from 'next/link'
import Icon from './components/ui-icon'
export default function Home() {
  return <div className="landing"><p className="eyebrow">CONECTAMOS A TU COMUNIDAD</p><h1>Cada día cuenta.<br/>Acompáñalo de cerca.</h1><p>Asistencia, comportamiento y reportes escolares en un solo lugar. Un espacio para el colegio, los docentes y las familias.</p><Link className="button-link" href="/dashboard">Entrar a mi panel<Icon name="arrow"/></Link><div className="landing-features"><span>Asistencia y QR</span><span>Seguimiento escolar</span><span>Consulta familiar</span></div></div>
}
