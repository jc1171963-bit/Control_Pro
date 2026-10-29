import { Link } from 'react-router-dom';

export default function NoEncontrado() {
  return (
    <div className="contenedor py-24 text-center">
      <p className="font-display text-6xl font-extrabold text-tinta-200">404</p>
      <h1 className="mt-2 font-display text-2xl font-bold">No encontramos esta página</h1>
      <Link to="/" className="mt-6 inline-block rounded-full bg-tinta-900 px-5 py-2 text-sm font-semibold text-white">Volver al inicio</Link>
    </div>
  );
}
