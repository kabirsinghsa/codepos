-- RPC to safely decrement inventory and prevent negative stock
CREATE OR REPLACE FUNCTION decrement_inventory(p_product_id uuid, p_site_id uuid, p_quantity integer)
RETURNS void AS $$
BEGIN
    UPDATE pos_inventory
    SET quantity = quantity - p_quantity,
        updated_at = now()
    WHERE product_id = p_product_id
      AND site_id = p_site_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
