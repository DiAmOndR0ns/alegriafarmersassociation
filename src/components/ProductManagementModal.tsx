import React, { useRef, useState } from 'react';
import { Product, OfficerRole, User as SystemUser } from '../types';
import { resolveOfficerPrefixed } from '../utils/officers';
import { isEggCatalogProduct } from '../utils/eggInventory';
import { compressImageFile, hasAttachedImage } from '../utils/imageUpload';
import { ShoppingBag, Plus, Edit, Trash2, Eye, EyeOff, X, Search, Tag, Package, User, Phone, MapPin, Upload, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { useLanguage } from '../i18n/LanguageContext';

interface ProductManagementModalProps {
  products: Product[];
  currentRole: OfficerRole;
  onAddProduct: (product: Omit<Product, 'id'>) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onClose: () => void;
  users?: SystemUser[];
}


export default function ProductManagementModal({
  products,
  currentRole,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onClose,
  users = []
}: ProductManagementModalProps) {
  const { isEnglish: en } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [cebName, setCebName] = useState('');
  const [category, setCategory] = useState<Product['category']>('Produce');
  const [price, setPrice] = useState<number>(100);
  const [unit, setUnit] = useState('matag kilo');
  const [quantityAvailable, setQuantityAvailable] = useState('100 ka kilo');
  const [description, setDescription] = useState('');
  const [specs, setSpecs] = useState('');
  const [stockStatus, setStockStatus] = useState<Product['stockStatus']>('In Stock');
  const [farmerName, setFarmerName] = useState('');
  const [farmerSitio, setFarmerSitio] = useState('');
  const [farmerPhone, setFarmerPhone] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageError, setImageError] = useState('');
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [isPublished, setIsPublished] = useState(true);
  const [otherCategory, setOtherCategory] = useState('');
  const hasEggCatalogProduct = products.some(isEggCatalogProduct);
  const canManageProducts = ['President', 'Treasurer', 'Assistant_Treasurer', 'Auditor', 'PIO'].includes(currentRole);

  // Resolved from the officers ACTUALLY delegated in the system — no hardcoded names.
  const getOfficerTitle = (role: OfficerRole) => resolveOfficerPrefixed(users, role);

  const handleProductImageFile = async (file: File) => {
    setImageError('');
    setIsProcessingImage(true);
    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 960,
        maxHeight: 720,
        quality: 0.82
      });
      setImageUrl(compressed);
    } catch (error: any) {
      setImageError(error?.message || (en ? 'Please select a valid image file (PNG, JPG, or WebP).' : 'Palihug pagpili og tinuod nga hulagway (PNG, JPG, o WebP).'));
    } finally {
      setIsProcessingImage(false);
    }
  };

  const handleProductImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) {
      void handleProductImageFile(file);
    }
  };

  const handleOpenAdd = () => {
    if (!canManageProducts) return;
    setEditingProduct(null);
    setName('');
    setCebName('');
    setCategory('Produce');
    setPrice(100);
    setUnit('matag kilo');
    setQuantityAvailable('100 ka kilo');
    setDescription('');
    setSpecs('');
    setStockStatus('In Stock');
    setFarmerName('');
    setFarmerSitio('Sitio Tapon');
    setFarmerPhone('');
    setImageUrl('');
    setImageError('');
    setIsPublished(true);
    setOtherCategory('');
    setShowAddEditModal(true);
  };

  const handleOpenEggSetup = () => {
    setEditingProduct(null);
    setName('Chicken Eggs');
    setCebName('Itlog sa Manok');
    setCategory('Produce');
    setPrice(0);
    setUnit('per egg');
    setQuantityAvailable('Managed automatically from verified harvests');
    setDescription('Fresh eggs from the AFA poultry project. Contact AFA to place an order.');
    setSpecs('');
    setStockStatus('In Stock');
    setFarmerName('AFA Poultry Project');
    setFarmerSitio('');
    setFarmerPhone('');
    setImageUrl('');
    setImageError('');
    setIsPublished(true);
    setOtherCategory('');
    setShowAddEditModal(true);
  };

  const handleOpenEdit = (p: Product) => {
    setEditingProduct(p);
    setName(p.name);
    setCebName(p.cebName || '');
    setCategory(p.category);
    setOtherCategory(!['Produce', 'Livestock', 'Processed Goods', 'Seeds & Fertilizer', 'Coffee & Crops', 'Rental Assets'].includes(p.category) ? p.category : '');
    setPrice(p.price);
    setUnit(p.unit);
    setQuantityAvailable(p.quantityAvailable || 'Available in harvest stock');
    setDescription(p.description);
    setSpecs(p.specs || '');
    setStockStatus(p.stockStatus);
    setFarmerName(p.farmerName || p.contactPerson || '');
    setFarmerSitio(p.farmerSitio || '');
    setFarmerPhone(p.farmerPhone || '');
    setImageUrl(p.imageUrl || '');
    setImageError('');
    setIsPublished(p.isPublished);
    setShowAddEditModal(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !description.trim()) return;
    if (!hasAttachedImage(imageUrl)) {
      setImageError(
        en
          ? 'A product picture is required. Please upload or attach an image before saving.'
          : 'Kinahanglan nga naay hulagway ang produkto. Palihug pag-upload og hulagway sa dili pa i-save.'
      );
      return;
    }

    const finalCategory = (category === 'Other' ? otherCategory.trim() : category) || 'Other';
    if (!finalCategory) return;

    const contactStr = `${farmerName || 'AFA Member Farmer'} ${farmerSitio ? `• ${farmerSitio}` : ''} (${farmerPhone || 'Contact AFA Officer'})`;

    if (editingProduct) {
      onUpdateProduct({
        ...editingProduct,
        name,
        cebName,
        category: finalCategory,
        price: Number(price),
        unit,
        quantityAvailable,
        description,
        specs,
        stockStatus,
        farmerName,
        farmerSitio,
        farmerPhone,
        contactPerson: contactStr,
        imageUrl,
        isPublished,
        updatedBy: getOfficerTitle(currentRole),
        dateUpdated: new Date().toISOString().split('T')[0]
      });
    } else {
      onAddProduct({
        name,
        cebName,
        category: finalCategory,
        price: Number(price),
        unit,
        quantityAvailable,
        description,
        specs,
        stockStatus,
        farmerName,
        farmerSitio,
        farmerPhone,
        contactPerson: contactStr,
        imageUrl,
        isPublished,
        updatedBy: getOfficerTitle(currentRole),
        managedBy: getOfficerTitle(currentRole),
        dateUpdated: new Date().toISOString().split('T')[0]
      });
    }

    setShowAddEditModal(false);
  };

  const handleTogglePublish = (p: Product) => {
    onUpdateProduct({
      ...p,
      isPublished: !p.isPublished,
      updatedBy: getOfficerTitle(currentRole),
      dateUpdated: new Date().toISOString().split('T')[0]
    });
  };

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.cebName && p.cebName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="w-full text-left">
      <div className="dim-card w-full rounded-3xl overflow-hidden flex flex-col text-[#163327]">

        {/* HEADER */}
        <div className="p-4 sm:p-5 bg-gradient-to-b from-[#FAF8F5] to-[#F3F8F4] border-b border-[#E3EFE6] flex justify-between items-center gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-2xl bg-[#FFF0C2] border border-[#E9B34A]/50 text-[#8A5404] shrink-0">
              <ShoppingBag className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base sm:text-lg font-bold text-[#1B4332] truncate">
                {en ? 'Product Catalog' : 'Merkado & Produkto'}
              </h2>
              <p className="text-xs text-[#455C50] font-medium truncate">
                FAMS • Alegria Farmers Association
              </p>
            </div>
          </div>
          <span className="text-xs font-extrabold font-mono bg-[#1B4332] text-[#FFF0C2] px-3 py-1 rounded-full shrink-0">
            {filteredProducts.length} items
          </span>
        </div>

        {/* CONTROLS BAR */}
        <div className="p-3.5 sm:p-4 bg-[#FAF8F5] border-b border-[#E3EFE6] flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto flex-1 max-w-lg">
            <div className="relative w-full">
              <Search className="w-4 h-4 text-[#455C50] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder={en ? 'Search products...' : 'Pangitaa ang produkto...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="form-input pl-10 pr-3 py-2 text-sm text-[#163327]"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="form-control sm:w-auto px-3 py-2 text-sm text-[#163327] shrink-0"
            >
              <option value="All">{en ? 'All Categories' : 'Tanan Kategoriya'}</option>
              <option value="Produce">{en ? 'Produce' : 'Produce (Ani)'}</option>
              <option value="Livestock">{en ? 'Livestock' : 'Livestock (Baboy/Manok)'}</option>
              <option value="Processed Goods">{en ? 'Processed Goods' : 'Processed Goods'}</option>
              <option value="Seeds & Fertilizer">{en ? 'Seeds & Fertilizer' : 'Seeds & Fertilizer'}</option>
              <option value="Coffee & Crops">{en ? 'Coffee & Crops' : 'Coffee & Crops'}</option>
              <option value="Rental Assets">{en ? 'Rental Assets' : 'Rental Assets'}</option>
              <option value="Other">{en ? 'Other' : 'Other (Iba pa)'}</option>
            </select>
          </div>

          {canManageProducts ? (
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              {!hasEggCatalogProduct && (
                <button
                  type="button"
                  onClick={handleOpenEggSetup}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shrink-0"
                >
                  <Tag className="w-4 h-4" />
                  <span>{en ? 'Set Egg Price' : 'Itakda ang Presyo sa Itlog'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleOpenAdd}
                className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2 bg-[#1B4332] hover:bg-[#143326] text-white rounded-xl text-xs font-black transition-all cursor-pointer shadow-md shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{en ? 'Add Product' : 'Idugang ang Produkto (Add Product)'}</span>
              </button>
            </div>
          ) : (
            <span className="text-xs font-bold text-[#455C50] bg-[#EAF4EC] border border-[#1B4332]/20 px-3 py-1.5 rounded-xl">
              {en
                ? 'View-only mode (managed by PIO, Treasurer, Auditor, or President)'
                : 'Tan-aw ra (gidumala sa PIO, Mamahandi, Tig-audit, o Presidente)'}
            </span>
          )}
        </div>

        <p className="px-4 pt-3 text-xs font-semibold text-[#4A5F57]">
          {en
            ? 'Egg listing stock and availability are updated automatically from verified harvests and recorded egg sales. Set its price and unit in the Eggs product details.'
            : 'Awtomatikong i-update ang stock sa itlog base sa gi-aprubahang ani ug natala nga halin. Ibutang ang presyo ug yunit sa detalye sa produkto nga Itlog.'}
        </p>

        {/* PRODUCTS GRID / LIST */}
        <div className="p-6 space-y-4">
          {filteredProducts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#D5CFC1]">
              <Package className="w-12 h-12 text-[#4A5F57] mx-auto mb-3" />
              <p className="text-sm font-bold text-[#1B4332]">{en ? 'No products found' : 'Walay nakit-an nga produkto'}</p>
              <p className="text-xs text-[#4A5F57] mt-1">{en ? 'Use "Add Product" to register a new item in the catalog.' : 'I-click ang "Idugang ang Produkto" aron makadugang og bag-ong baligya sa asosasyon.'}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredProducts.map((product) => (
                <div
                  key={product.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                    product.isPublished
                      ? 'bg-white border-[#D5CFC1] hover:border-[#C9BDAE]'
                      : 'bg-[#F7F4EF] border-[#D5CFC1] opacity-80'
                  }`}
                >
                  <div>
                    {product.imageUrl && (
                      <div className="product-media-frame mb-3 max-h-44">
                        <img src={product.imageUrl} alt={product.name} loading="lazy" />
                      </div>
                    )}
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                          {product.category}
                        </span>
                        <h3 className="text-sm font-black text-[#1B4332] mt-1">{product.name}</h3>
                        {product.cebName && (
                          <p className="text-xs font-semibold text-emerald-700 font-sans">{product.cebName}</p>
                        )}
                      </div>

                      {canManageProducts && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePublish(product)}
                          title={product.isPublished ? 'Unpublish from Public Catalog' : 'Publish to Public Catalog'}
                          className={`p-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                            product.isPublished
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200'
                              : 'bg-slate-200 text-[#4A5F57] border-slate-300 hover:text-[#1B4332]'
                          }`}
                        >
                          {product.isPublished ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenEdit(product)}
                          className="p-1.5 rounded-lg bg-[#F7F4EF] text-[#1B4332] border border-[#D5CFC1] hover:bg-[#F0EDE7] transition-all cursor-pointer"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Sigurado ka nga gusto nimong idelete ang ${product.name}?`)) {
                              onDeleteProduct(product.id);
                            }
                          }}
                          className="p-1.5 rounded-lg bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-200 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      )}
                    </div>

                    <p className="text-xs text-[#4A5F57] mt-2 line-clamp-2">{product.description}</p>

                    {product.specs && (
                      <p className="text-[11px] text-[#4A5F57] italic mt-1">Specs: {product.specs}</p>
                    )}

                    {/* Quantity Available & Farmer Details */}
                    <div className="mt-2.5 p-2.5 bg-[#F7F4EF] border border-[#D5CFC1] rounded-xl space-y-1 text-xs">
                      {product.quantityAvailable && (
                        <div className="flex items-center gap-1.5 text-[#1B4332] font-semibold">
                          <Package className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                          <span><strong>{en ? 'Quantity' : 'Kadaghanon (Quantity)'}:</strong> {product.quantityAvailable}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[#1B4332] font-semibold">
                        <User className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span><strong>{en ? 'Selling Farmer' : 'Mag-uuma (Selling Farmer)'}:</strong> {product.farmerName || product.contactPerson || 'AFA Member'}</span>                      </div>
                      {(product.farmerSitio || product.farmerPhone) && (
                        <div className="flex items-center gap-3 text-[11px] text-[#4A5F57] pl-5">
                          {product.farmerSitio && (
                            <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-[#4A5F57]" /> {product.farmerSitio}</span>
                          )}
                          {product.farmerPhone && (
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-emerald-700" /> {product.farmerPhone}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#D5CFC1] flex items-center justify-between text-xs">
                    <div>
                      <span className="text-sm font-mono font-black text-amber-700">
                        PHP {product.price.toLocaleString()}
                      </span>
                      <span className="text-[10px] text-[#4A5F57] ml-1">/ {product.unit}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        product.stockStatus === 'In Stock' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                        product.stockStatus === 'Low Stock' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                        product.stockStatus === 'Pre-Order' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                        'bg-rose-100 text-rose-700 border border-rose-200'
                      }`}>
                        {product.stockStatus}
                      </span>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        product.isPublished ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-slate-200 text-[#4A5F57] border border-slate-300'
                      }`}>
                        {product.isPublished ? (en ? 'Published' : 'Gimantala (Published)') : 'Draft'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PAGE FOOTER */}
        <div className="p-3.5 bg-white border-t border-[#D5CFC1] text-[10px] text-[#4A5F57] text-center font-mono">
          Alegria Farmers Association (AFA) • Product Registry        </div>
      </div>

      {/* ADD / EDIT PRODUCT SUB-MODAL (Mobile Bottom-Sheet -> Desktop Dialog) */}
      {showAddEditModal && (
        <div className="modal-backdrop z-[100] animate-fade-in text-left" onClick={() => setShowAddEditModal(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="modal-panel !max-w-3xl p-4 sm:p-6 space-y-4 text-[#163327]"
          >
            <div className="w-11 h-1 rounded-full bg-[#1B4332]/20 mx-auto sm:hidden" aria-hidden="true" />
            <div className="flex justify-between items-center border-b border-[#E3EFE6] pb-3">
              <h3 className="font-display text-base sm:text-lg font-bold text-[#1B4332] flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-[#C2410C]" />
                <span>{editingProduct ? 'I-edit ang Produkto' : 'Idugang ang Bag-ong Produkto'}</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddEditModal(false)}
                aria-label="Close product form"
                className="min-w-10 min-h-10 rounded-xl flex items-center justify-center text-[#455C50] hover:bg-[#EAF6EE] hover:text-[#1B4332] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-sm">
              {/* REQUIRED PRODUCT PICTURE UPLOAD */}
              <div className="space-y-2">
                <label className="block text-[#1B4332] font-bold">
                  {en ? 'Product Picture (Required)' : 'Hulagway sa Produkto (Kinahanglan)'}{' '}
                  <span className="text-[#C2410C]" aria-hidden="true">*</span>
                </label>

                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProductImageChange}
                  className="hidden"
                  aria-label={en ? 'Upload product picture' : 'Pag-upload og hulagway sa produkto'}
                />

                {imageUrl ? (
                  <div className="dim-card rounded-2xl p-3 space-y-2.5">
                    <div className="product-media-frame max-h-52">
                      <img src={imageUrl} alt={name || 'Product preview'} />
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[#2D6A4F] inline-flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                        <span>{en ? 'Picture attached' : 'Naka-attach na ang hulagway'}</span>
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => imageInputRef.current?.click()}
                          className="btn-bevel-secondary px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{en ? 'Replace Photo' : 'Ilisi ang Hulagway'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setImageUrl('');
                            setImageError('');
                          }}
                          className="px-3 py-1.5 rounded-xl text-xs font-extrabold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 cursor-pointer inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{en ? 'Remove' : 'Tangtanga'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => imageInputRef.current?.click()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        imageInputRef.current?.click();
                      }
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingImage(true);
                    }}
                    onDragLeave={() => setIsDraggingImage(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingImage(false);
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) void handleProductImageFile(droppedFile);
                    }}
                    className={`rounded-2xl border-2 border-dashed p-5 text-center cursor-pointer transition-all ${
                      imageError
                        ? 'border-rose-400 bg-rose-50/60'
                        : isDraggingImage
                        ? 'border-[#1B4332] bg-[#EAF6EE]'
                        : 'border-[#B8CEBF] bg-[#FAF8F5] hover:border-[#1B4332] hover:bg-white'
                    }`}
                  >
                    <div className="w-11 h-11 rounded-2xl bg-[#D6EFD9] text-[#1B4332] mx-auto mb-2 flex items-center justify-center">
                      <Upload className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <p className="text-sm font-extrabold text-[#1B4332]">
                      {isProcessingImage
                        ? en ? 'Processing image...' : 'Nag-andam sa hulagway...'
                        : en ? 'Click or drag & drop a product photo here' : 'Pindota o i-drag ang hulagway sa produkto diri'}
                    </p>
                    <p className="text-xs text-[#455C50] mt-1 font-medium">
                      {en
                        ? 'Required • PNG, JPG, or WebP (automatically compressed for fast loading)'
                        : 'Kinahanglan • PNG, JPG, o WebP (awtomatikong gi-compress)'}
                    </p>
                  </div>
                )}

                {imageError && (
                  <p role="alert" className="flex items-center gap-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{imageError}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[#1B4332] font-bold mb-1">Pangalan sa Produkto (English Name):</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="form-input px-3.5 py-2.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-[#1B4332] font-bold mb-1">Visayan / Cebuano Title:</label>
                <input
                  type="text"
                  value={cebName}
                  onChange={(e) => setCebName(e.target.value)}
                  className="form-input px-3.5 py-2.5 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#4A5F57] font-bold mb-1">Kategoriya (Category):</label>
                  {category === 'Other' || !['Produce', 'Livestock', 'Processed Goods', 'Seeds & Fertilizer', 'Coffee & Crops', 'Rental Assets'].includes(category) ? (
                    <input
                      type="text"
                      value={otherCategory}
                      onChange={(e) => setOtherCategory(e.target.value)}
                      placeholder="Enter new category name"
                      className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500"
                    />
                  ) : (
                  <select
                    value={category}
                    onChange={(e) => {
                      if (e.target.value === 'Other') { setOtherCategory(''); }
                      setCategory(e.target.value as any);
                    }}
                    className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Produce">Produce (Ani)</option>
                    <option value="Livestock">Livestock (Baboy/Manok)</option>
                    <option value="Processed Goods">Processed Goods</option>
                    <option value="Seeds & Fertilizer">Seeds & Fertilizer</option>
                    <option value="Coffee & Crops">Coffee & Crops</option>
                    <option value="Rental Assets">Rental Assets</option>
                    <option value="Other">Other (Iba pa — type your own)</option>
                  </select>
                  )}
                </div>

                <div>
                  <label className="block text-[#4A5F57] font-bold mb-1">Stock Status:</label>
                  <select
                    value={stockStatus}
                    onChange={(e) => setStockStatus(e.target.value as any)}
                    className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500"
                  >
                    <option value="In Stock">In Stock (Anya ra)</option>
                    <option value="Low Stock">Low Stock</option>
                    <option value="Pre-Order">Pre-Order</option>
                    <option value="Out of Stock">Out of Stock</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[#4A5F57] font-bold mb-1">Presyo (PHP):</label>
                  <input
                    type="number"
                    min={isEggCatalogProduct({ name, cebName }) ? 0.01 : 0}
                    step="0.01"
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[#4A5F57] font-bold mb-1">Unidad (Unit):</label>
                  <input
                    type="text"
                    required
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500"
                  />
                  {isEggCatalogProduct({ name, cebName }) && (
                    <p className="mt-1 text-[10px] font-semibold text-[#4A5F57]">
                      {en
                        ? 'Enter a unit such as “per egg” or “per tray”. Public stock is calculated in eggs.'
                        : 'Ibutang ang yunit sama sa “per egg” o “per tray”. Ang stock sa publiko kwentahon isip gidaghanon sa itlog.'}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-[#4A5F57] font-bold mb-1">Kadaghanon nga Baligya (Quantity Available):</label>
                <input
                  type="text"
                  required
                  value={quantityAvailable}
                  onChange={(e) => setQuantityAvailable(e.target.value)}
                  className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500 font-semibold"
                />
              </div>

              {/* FARMER SELLER CONTACT DETAILS */}
              <div className="p-3 bg-amber-100 border border-amber-200 rounded-xl space-y-2">
                <span className="block text-amber-800 font-bold text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-700" />
                  Detalyas sa Mag-uuma nga Nagbaligya (Selling Farmer Contact):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Pangalan sa Mag-uuma (Farmer Name)"
                    value={farmerName}
                    onChange={(e) => setFarmerName(e.target.value)}
                    className="bg-white border border-[#D5CFC1] rounded-lg px-2.5 py-1.5 text-[#1B4332] focus:outline-none focus:border-amber-500 text-xs"
                  />
                  <select
                    value={farmerSitio}
                    onChange={(e) => setFarmerSitio(e.target.value)}
                    className="bg-white border border-[#D5CFC1] rounded-lg px-2.5 py-1.5 text-[#1B4332] focus:outline-none focus:border-amber-500 text-xs"
                  >
                    <option value="">Pilia ang Sitio (Official 5 Sitios)</option>
                    <option value="Sitio Tapon">Sitio Tapon</option>
                    <option value="Sitio Pundok 1">Sitio Pundok 1</option>
                    <option value="Sitio Pundok 2">Sitio Pundok 2</option>
                    <option value="Sitio Lamak">Sitio Lamak</option>
                    <option value="Sitio Patag 1">Sitio Patag 1</option>
                  </select>                  <input
                    type="text"
                    required
                    placeholder="Numero sa Telepono (Phone)"
                    value={farmerPhone}
                    onChange={(e) => setFarmerPhone(e.target.value)}
                    className="bg-white border border-[#D5CFC1] rounded-lg px-2.5 py-1.5 text-[#1B4332] focus:outline-none focus:border-amber-500 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[#4A5F57] font-bold mb-1">Pahayag / Description:</label>
                <textarea
                  rows={2}
                  required
                  placeholder="Mubo nga deskripsyon sa produkto ug mga kaayohan niini..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[#4A5F57] font-bold mb-1">Especificaciones / Specs (Optional):</label>
                <input
                  type="text"
                  value={specs}
                  onChange={(e) => setSpecs(e.target.value)}
                  className="w-full bg-white border border-[#D5CFC1] rounded-xl px-3 py-2 text-[#1B4332] focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="publish-checkbox"
                  checked={isPublished}
                  onChange={(e) => setIsPublished(e.target.checked)}
                  className="rounded bg-white border-[#D5CFC1] text-emerald-600 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="publish-checkbox" className="text-[#1B4332] font-bold text-xs cursor-pointer">
                  I-mantala dayon sa Guest Portal ug Member Catalog (Publish)
                </label>
              </div>

              <div className="pt-3 grid grid-cols-2 sm:flex sm:justify-end gap-2.5 border-t border-[#E3EFE6]">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="btn-bevel-secondary px-4 py-2.5 rounded-xl font-extrabold cursor-pointer"
                >
                  {en ? 'Cancel' : 'Kanselahi'}
                </button>
                <button
                  type="submit"
                  disabled={isProcessingImage}
                  className="btn-bevel-forest px-5 py-2.5 rounded-xl font-extrabold cursor-pointer disabled:opacity-60"
                >
                  {isProcessingImage
                    ? (en ? 'Processing photo...' : 'Nag-process sa hulagway...')
                    : (en ? 'Save Product' : 'I-save ang Produkto')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
