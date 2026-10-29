import { useQuery } from '@tanstack/react-query';
import { get } from '../../api/cliente';
import type { ProductoResumen } from '../../api/tipos';
import { Cargando, Tarjeta, Vacio } from '../../components/ui';
import ProductoCard from '../tienda/ProductoCard';

export default function Favoritos() {
  const q = useQuery({ queryKey: ['favoritos'], queryFn: () => get<ProductoResumen[]>('/cuenta/favoritos') });
  return (
    <Tarjeta titulo="Favoritos">
      {q.isLoading ? <Cargando /> : !q.data?.length ? <Vacio titulo="Sin favoritos" texto="Marca con el corazón los productos que quieras tener a la mano." /> : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">{q.data.map((p) => <ProductoCard key={p.id} p={p} />)}</div>
      )}
    </Tarjeta>
  );
}
